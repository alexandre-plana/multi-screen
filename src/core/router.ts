import { compile, match, type MatchFunction, type ParamData } from 'path-to-regexp';
import { createBrowserHistory, createHashHistory, createMemoryHistory, type History } from 'history';
import { Emitter, type Listener, type Unsubscribe } from './emitter.js';

/** Location as seen by the screen router. */
export interface RouterLocation {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Bridge between the screen router and whatever owns the URL.
 *
 * The default adapters are built on `history` (the framework-agnostic
 * package behind React Router), but any router can be plugged in: React
 * Router, TanStack Router, Vue Router, Angular… only these three members are
 * needed.
 */
export interface RouterAdapter {
  readonly location: RouterLocation;
  navigate(path: string, options?: { replace?: boolean; state?: unknown }): void;
  subscribe(listener: (location: RouterLocation) => void): Unsubscribe;
  /** Turns an app path into an href (hash routers prefix with `#`). */
  createHref?(path: string): string;
}

/** Wraps a `history` instance. */
export function historyAdapter(history: History): RouterAdapter {
  return {
    get location() {
      return { pathname: history.location.pathname, search: history.location.search, hash: history.location.hash };
    },
    navigate(path, options) {
      if (options?.replace) history.replace(path, options.state);
      else history.push(path, options?.state);
    },
    subscribe(listener) {
      return history.listen(({ location }) => listener({ pathname: location.pathname, search: location.search, hash: location.hash }));
    },
    createHref: (path) => history.createHref(path),
  };
}

/** `/screens/lobby` URLs. Needs the server to fall back to index.html. */
export const browserRouter = (options?: { window?: Window }): RouterAdapter => historyAdapter(createBrowserHistory(options));
/** `#/screens/lobby` URLs: works from any static host or `file://`. */
export const hashRouter = (options?: { window?: Window }): RouterAdapter => historyAdapter(createHashHistory(options));
/** In-memory URLs: tests, embedded previews, server side. */
export const memoryRouter = (initialPath = '/'): RouterAdapter => historyAdapter(createMemoryHistory({ initialEntries: [initialPath] }));

export interface RouteDefinition {
  /** Stable id, defaults to the path. */
  id?: string;
  /** path-to-regexp pattern: `/lobby`, `/hall/:zone`, `/wall{/:index}`, `/files/*path`. */
  path: string;
  /** Screen shown by this route. */
  screenId?: string;
  /** Dynamic resolution: computes the screen id from the params (e.g. `/screens/:screenId`). */
  resolve?: (params: Record<string, string | string[]>, location: RouterLocation) => string | undefined;
  /** Higher priority routes are tried first. Default 0. */
  priority?: number;
  meta?: Record<string, unknown>;
}

export interface RouteRecord extends RouteDefinition {
  id: string;
}

export interface RouteMatch {
  route: RouteRecord;
  params: Record<string, string | string[]>;
  /** Resolved screen id, if any. */
  screenId: string | undefined;
  location: RouterLocation;
}

export type RouterEvent =
  | { type: 'routes'; routes: RouteRecord[] }
  | { type: 'navigate'; match: RouteMatch | undefined; location: RouterLocation };

interface CompiledRoute {
  record: RouteRecord;
  matcher: MatchFunction<ParamData>;
  order: number;
  dynamic: number;
  /** Catch-all routes are tried after every other route of the same priority. */
  splat: boolean;
}

export interface ScreenRouterOptions {
  adapter?: RouterAdapter;
  /** Prefix stripped before matching, e.g. `/app`. */
  basePath?: string;
  /**
   * Registers the generic `<screenRoutePrefix>/:screenId` route so that any
   * stored screen is reachable without declaring a route. Default `/screens`;
   * `false` disables it.
   */
  screenRoutePrefix?: string | false;
}

/**
 * Router of screens whose routes are created, replaced and removed at
 * runtime. It never renders anything: it tells which screen the current URL
 * points to.
 */
export class ScreenRouter {
  readonly adapter: RouterAdapter;
  readonly basePath: string;
  readonly screenRoutePrefix: string | false;
  readonly #routes = new Map<string, CompiledRoute>();
  readonly #events = new Emitter<RouterEvent>();
  #counter = 0;
  #current: RouteMatch | undefined;
  #unlisten: Unsubscribe | undefined;

  constructor(options: ScreenRouterOptions = {}) {
    this.adapter = options.adapter ?? memoryRouter();
    this.basePath = (options.basePath ?? '').replace(/\/+$/, '');
    this.screenRoutePrefix = options.screenRoutePrefix === undefined ? '/screens' : options.screenRoutePrefix;
    if (this.screenRoutePrefix !== false) {
      this.addRoute({
        id: 'multi-screen:screen',
        path: `${this.screenRoutePrefix}/:screenId`,
        priority: -1000,
        resolve: (params) => (typeof params.screenId === 'string' ? params.screenId : undefined),
      });
    }
    this.#current = this.match(this.adapter.location);
    this.#unlisten = this.adapter.subscribe((location) => this.#refresh(location));
  }

  #refresh(location = this.adapter.location): void {
    const next = this.match(location);
    const changed =
      next?.route.id !== this.#current?.route.id ||
      next?.screenId !== this.#current?.screenId ||
      JSON.stringify(next?.params) !== JSON.stringify(this.#current?.params) ||
      location.pathname !== this.#current?.location.pathname;
    this.#current = next;
    if (changed) this.#events.emit({ type: 'navigate', match: next, location });
  }

  /** Adds (or replaces, same id) a route. Returns a function removing it. */
  addRoute(definition: RouteDefinition): Unsubscribe {
    if (!definition.path.startsWith('/')) throw new Error(`Route path must start with "/": ${definition.path}`);
    const record: RouteRecord = { ...definition, id: definition.id ?? definition.path };
    const existing = this.#routes.get(record.id);
    this.#routes.set(record.id, {
      record,
      matcher: match(record.path, { decode: safeDecode }),
      order: existing?.order ?? this.#counter++,
      dynamic: (record.path.match(/[:*]/g) ?? []).length,
      splat: record.path.includes('*'),
    });
    this.#changed();
    return () => {
      if (this.#routes.get(record.id)?.record === record) this.removeRoute(record.id);
    };
  }

  /** Adds or replaces many routes at once (e.g. loaded from a server). */
  setRoutes(definitions: RouteDefinition[], options: { replaceAll?: boolean } = {}): void {
    if (options.replaceAll) {
      for (const id of [...this.#routes.keys()]) if (id !== 'multi-screen:screen') this.#routes.delete(id);
    }
    for (const definition of definitions) {
      const record: RouteRecord = { ...definition, id: definition.id ?? definition.path };
      this.#routes.set(record.id, {
        record,
        matcher: match(record.path, { decode: safeDecode }),
        order: this.#routes.get(record.id)?.order ?? this.#counter++,
        dynamic: (record.path.match(/[:*]/g) ?? []).length,
      splat: record.path.includes('*'),
      });
    }
    this.#changed();
  }

  removeRoute(id: string): boolean {
    const removed = this.#routes.delete(id);
    if (removed) this.#changed();
    return removed;
  }

  #changed(): void {
    this.#events.emit({ type: 'routes', routes: this.routes() });
    // Constructor: adapter not subscribed yet.
    if (this.#unlisten) this.#refresh();
  }

  getRoute(id: string): RouteRecord | undefined {
    return this.#routes.get(id)?.record;
  }

  /** Routes in matching order. */
  routes(): RouteRecord[] {
    return this.#sorted().map((r) => r.record);
  }

  #sorted(): CompiledRoute[] {
    return [...this.#routes.values()].sort(
      (a, b) => (b.record.priority ?? 0) - (a.record.priority ?? 0) || Number(a.splat) - Number(b.splat) || a.dynamic - b.dynamic || a.order - b.order,
    );
  }

  /** Finds the route for a path or location, without navigating. */
  match(target: string | RouterLocation): RouteMatch | undefined {
    const location: RouterLocation = typeof target === 'string' ? parsePath(target) : target;
    let pathname = location.pathname;
    if (this.basePath) {
      if (pathname !== this.basePath && !pathname.startsWith(`${this.basePath}/`)) return undefined;
      pathname = pathname.slice(this.basePath.length) || '/';
    }
    for (const compiled of this.#sorted()) {
      const result = compiled.matcher(pathname);
      if (!result) continue;
      const params = result.params as Record<string, string | string[]>;
      const screenId = compiled.record.resolve ? compiled.record.resolve(params, location) : compiled.record.screenId;
      return { route: compiled.record, params, screenId, location };
    }
    return undefined;
  }

  get current(): RouteMatch | undefined {
    return this.#current;
  }

  navigate(path: string, options?: { replace?: boolean; state?: unknown }): void {
    this.adapter.navigate(this.basePath + path, options);
  }

  /**
   * Path of a screen: the first route pointing at it (params filled from
   * `params`), else the generic screen route.
   */
  pathFor(screenId: string, params: Record<string, string | string[]> = {}): string | undefined {
    for (const { record } of this.#sorted()) {
      if (record.screenId !== screenId) continue;
      try {
        return compile(record.path, { encode: encodeURIComponent })(params);
      } catch {
        // Missing params: try the next route.
      }
    }
    if (this.screenRoutePrefix === false) return undefined;
    return `${this.screenRoutePrefix}/${encodeURIComponent(screenId)}`;
  }

  hrefFor(screenId: string, params?: Record<string, string | string[]>): string | undefined {
    const path = this.pathFor(screenId, params);
    if (path === undefined) return undefined;
    const full = this.basePath + path;
    return this.adapter.createHref ? this.adapter.createHref(full) : full;
  }

  navigateToScreen(screenId: string, params?: Record<string, string | string[]>, options?: { replace?: boolean }): void {
    const path = this.pathFor(screenId, params);
    if (path === undefined) throw new Error(`No route leads to screen "${screenId}"`);
    this.navigate(path, options);
  }

  subscribe(listener: Listener<RouterEvent>): Unsubscribe {
    return this.#events.subscribe(listener);
  }

  dispose(): void {
    this.#unlisten?.();
    this.#events.clear();
  }
}

export function createScreenRouter(options?: ScreenRouterOptions): ScreenRouter {
  return new ScreenRouter(options);
}

/** Malformed percent-encoding (`%ZZ`) is kept as is instead of throwing. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parsePath(path: string): RouterLocation {
  const hashIndex = path.indexOf('#');
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : '';
  const rest = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const searchIndex = rest.indexOf('?');
  return {
    pathname: searchIndex >= 0 ? rest.slice(0, searchIndex) : rest,
    search: searchIndex >= 0 ? rest.slice(searchIndex) : '',
    hash,
  };
}
