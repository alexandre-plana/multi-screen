import { Emitter, type Listener, type Unsubscribe } from './emitter.js';
import { applyMergePatch, deepEqual, type MergePatch } from './patch.js';
import type { ScreenDefinition } from './types.js';
import { validateScreen } from './validate.js';

export type ScreenStoreEvent =
  | { type: 'put'; screen: ScreenDefinition; previous?: ScreenDefinition }
  | { type: 'remove'; screen: ScreenDefinition }
  | { type: 'reset'; screens: ScreenDefinition[] };

/** Where a store persists its screens. Sync or async. */
export interface ScreenStorage {
  load(): ScreenDefinition[] | undefined | Promise<ScreenDefinition[] | undefined>;
  save(screens: ScreenDefinition[]): void | Promise<void>;
}

export interface ScreenStoreOptions {
  /** Initial screens. */
  screens?: ScreenDefinition[];
  /** Persistence. When set, call `await store.ready` before reading. */
  storage?: ScreenStorage;
  /** Clock used for `updatedAt` (tests). */
  now?: () => Date;
}

export interface PutOptions {
  /**
   * `bump` (default) increments the version. `keep` stores the incoming
   * version as is: used when a device mirrors a screen sent by a hub.
   */
  version?: 'bump' | 'keep';
}

/**
 * Observable collection of screens. The single source of truth on a device
 * and on a controller.
 */
export class ScreenStore {
  readonly #screens = new Map<string, ScreenDefinition>();
  readonly #events = new Emitter<ScreenStoreEvent>();
  readonly #storage: ScreenStorage | undefined;
  readonly #now: () => Date;
  /** Ids written or removed before the storage finished loading: they win. */
  readonly #touched = new Set<string>();
  #loaded = false;
  /** Error raised by `storage.load()`, if any (the store then starts empty). */
  loadError: unknown;
  /** Resolves once the storage has been loaded. */
  readonly ready: Promise<void>;

  constructor(options: ScreenStoreOptions = {}) {
    this.#storage = options.storage;
    this.#now = options.now ?? (() => new Date());
    for (const screen of options.screens ?? []) this.#screens.set(screen.id, this.#stamp(validateScreen(screen), undefined, 'keep'));
    this.ready = this.#load();
  }

  async #load(): Promise<void> {
    if (!this.#storage) {
      this.#loaded = true;
      return;
    }
    let stored: ScreenDefinition[] | undefined;
    try {
      stored = await this.#storage.load();
    } catch (error) {
      this.loadError = error;
    }
    this.#loaded = true;
    if (!stored) return;
    for (const raw of stored) {
      try {
        const screen = validateScreen(raw);
        if (this.#touched.has(screen.id)) continue;
        this.#screens.set(screen.id, screen);
      } catch {
        // Ignore corrupted entries rather than refusing to start.
      }
    }
    if (this.#touched.size) this.#persist();
    this.#events.emit({ type: 'reset', screens: this.list() });
  }

  #stamp(screen: ScreenDefinition, previous: ScreenDefinition | undefined, mode: 'bump' | 'keep'): ScreenDefinition {
    const version = mode === 'keep' ? (screen.version ?? previous?.version ?? 1) : (previous?.version ?? 0) + 1;
    return { ...structuredClone(screen), version, updatedAt: mode === 'keep' && screen.updatedAt ? screen.updatedAt : this.#now().toISOString() };
  }

  #persist(): void {
    // Saving before the load completes would erase the stored screens.
    if (!this.#storage || !this.#loaded) return;
    void Promise.resolve(this.#storage.save(this.list())).catch(() => undefined);
  }

  get(id: string): ScreenDefinition | undefined {
    const screen = this.#screens.get(id);
    return screen && structuredClone(screen);
  }

  has(id: string): boolean {
    return this.#screens.has(id);
  }

  list(): ScreenDefinition[] {
    return [...this.#screens.values()].map((screen) => structuredClone(screen));
  }

  get size(): number {
    return this.#screens.size;
  }

  /** Creates or replaces a screen. Returns the stored copy. No-op if nothing changed. */
  put(input: ScreenDefinition, options: PutOptions = {}): ScreenDefinition {
    const screen = validateScreen(input);
    const previous = this.#screens.get(screen.id);
    const mode = options.version ?? 'bump';
    if (previous && sameContent(previous, screen) && (mode === 'bump' || previous.version === screen.version)) {
      return structuredClone(previous);
    }
    const stored = this.#stamp(screen, previous, mode);
    this.#touched.add(stored.id);
    this.#screens.set(stored.id, stored);
    this.#persist();
    this.#events.emit({ type: 'put', screen: structuredClone(stored), ...(previous ? { previous: structuredClone(previous) } : {}) });
    return structuredClone(stored);
  }

  /** Applies a JSON merge patch to a screen. Throws if the screen is unknown. */
  patch(id: string, patch: MergePatch<ScreenDefinition> | Record<string, unknown>, options: PutOptions = {}): ScreenDefinition {
    const previous = this.#screens.get(id);
    if (!previous) throw new Error(`Unknown screen "${id}"`);
    const next = applyMergePatch(previous, patch) as ScreenDefinition;
    next.id = id;
    return this.put(next, options);
  }

  remove(id: string): boolean {
    const screen = this.#screens.get(id);
    if (!screen) return false;
    this.#touched.add(id);
    this.#screens.delete(id);
    this.#persist();
    this.#events.emit({ type: 'remove', screen: structuredClone(screen) });
    return true;
  }

  clear(): void {
    this.#screens.clear();
    this.#persist();
    this.#events.emit({ type: 'reset', screens: [] });
  }

  subscribe(listener: Listener<ScreenStoreEvent>): Unsubscribe {
    return this.#events.subscribe(listener);
  }
}

function sameContent(a: ScreenDefinition, b: ScreenDefinition): boolean {
  const { version: _va, updatedAt: _ua, ...ra } = a;
  const { version: _vb, updatedAt: _ub, ...rb } = b;
  return deepEqual(ra, rb);
}

export function createScreenStore(options?: ScreenStoreOptions): ScreenStore {
  return new ScreenStore(options);
}

/** Persists screens in a Web Storage (localStorage by default). */
export function webStorage(key = 'multi-screen:screens', storage?: Storage): ScreenStorage {
  const target = () => storage ?? globalThis.localStorage;
  return {
    load() {
      const raw = target()?.getItem(key);
      if (!raw) return undefined;
      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? (parsed as ScreenDefinition[]) : undefined;
      } catch {
        return undefined;
      }
    },
    save(screens) {
      target()?.setItem(key, JSON.stringify(screens));
    },
  };
}
