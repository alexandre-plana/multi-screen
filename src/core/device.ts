import { mergeDisplay, mergeTheme } from './display.js';
import { applyMergePatch, contentHash } from './patch.js';
import { Emitter, type Listener, type Unsubscribe } from './emitter.js';
import { createEnvelope, createId, isTargeted, type AnyEnvelope, type Envelope, type MessageMap, type MessageType, type Transport } from './protocol.js';
import { ScreenRouter } from './router.js';
import { ScreenStore } from './store.js';
import type { DeviceInfo, DeviceState, DisplaySpec, ScreenDefinition, ThemeSpec } from './types.js';
import { validateDisplay, validateScreen, validateTheme } from './validate.js';

export type DeviceEvent =
  | { type: 'state'; state: DeviceState }
  | { type: 'identify'; durationMs: number }
  | { type: 'custom'; name: string; data: unknown; from: string }
  | { type: 'error'; error: Error; message?: AnyEnvelope };

export interface ScreenDeviceOptions {
  transport: Transport;
  /** Device description. `id` defaults to {@link persistentDeviceId}. */
  info?: Partial<DeviceInfo>;
  store?: ScreenStore;
  router?: ScreenRouter;
  /** Presence heartbeat. Default 15 s; 0 disables it. */
  heartbeatMs?: number;
  /**
   * Authorisation hook: return false to ignore a message (unknown hub,
   * missing signature…). Every command goes through it.
   */
  accept?: (message: AnyEnvelope) => boolean;
  /** Commands the device refuses, e.g. `['route/navigate']`. */
  deny?: MessageType[];
  /** Start immediately. Default true. */
  autoStart?: boolean;
  /**
   * Keeps theme and display overrides across reloads (kiosks that reboot).
   * A key uses localStorage; an object plugs any storage.
   */
  persistOverrides?: string | OverrideStorage;
}

/** Storage of a device's theme and display overrides. */
export interface OverrideStorage {
  load(): { theme?: ThemeSpec; display?: DisplaySpec } | undefined;
  save(overrides: { theme?: ThemeSpec; display?: DisplaySpec }): void;
}

function localOverrideStorage(key: string): OverrideStorage {
  return {
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        return raw ? (JSON.parse(raw) as { theme?: ThemeSpec; display?: DisplaySpec }) : undefined;
      } catch {
        return undefined;
      }
    },
    save(overrides) {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(overrides));
      } catch {
        // Storage full or blocked: overrides stay in memory.
      }
    },
  };
}

/**
 * The receiving end: a browser that shows screens. It mirrors the screens it
 * receives in its store, registers their routes in its router, and applies
 * theme and display commands.
 */
export class ScreenDevice {
  readonly info: DeviceInfo;
  readonly store: ScreenStore;
  readonly router: ScreenRouter;
  readonly #transport: Transport;
  readonly #events = new Emitter<DeviceEvent>();
  readonly #options: ScreenDeviceOptions;
  #theme: ThemeSpec | undefined;
  #display: DisplaySpec | undefined;
  #cleanups: Unsubscribe[] = [];
  #routeCleanups = new Map<string, Unsubscribe>();
  #started = false;
  #announceQueued = false;
  #heartbeat: ReturnType<typeof setInterval> | undefined;
  readonly #overrideStorage: OverrideStorage | undefined;

  constructor(options: ScreenDeviceOptions) {
    this.#options = options;
    this.#transport = options.transport;
    this.info = { ...options.info, id: options.info?.id ?? persistentDeviceId() } as DeviceInfo;
    this.store = options.store ?? new ScreenStore();
    this.router = options.router ?? new ScreenRouter();
    const persist = options.persistOverrides;
    this.#overrideStorage = typeof persist === 'string' ? localOverrideStorage(persist) : persist;
    const saved = this.#overrideStorage?.load();
    try {
      if (saved?.theme) this.#theme = validateTheme(saved.theme);
      if (saved?.display) this.#display = validateDisplay(saved.display);
    } catch {
      // Ignore corrupted overrides.
    }
    if (options.autoStart !== false) this.start();
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#cleanups.push(
      this.#transport.subscribe((message) => this.#receive(message)),
      this.store.subscribe((event) => {
        if (event.type === 'put') this.#syncRoute(event.screen);
        else if (event.type === 'remove') this.#syncRoute(undefined, event.screen.id);
        else for (const screen of event.screens) this.#syncRoute(screen);
        this.#stateChanged();
      }),
      this.router.subscribe((event) => {
        if (event.type === 'navigate') this.#stateChanged();
      }),
    );
    for (const screen of this.store.list()) this.#syncRoute(screen);
    // Viewport changes (rotation, window resize) are reported to hubs.
    const win = globalThis as unknown as { addEventListener?: Window['addEventListener']; removeEventListener?: Window['removeEventListener'] };
    if (typeof win.addEventListener === 'function' && !this.info.viewport) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onResize = () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.announce(), 300);
      };
      win.addEventListener('resize', onResize);
      this.#cleanups.push(() => {
        clearTimeout(timer);
        win.removeEventListener?.('resize', onResize);
      });
    }
    const heartbeat = this.#options.heartbeatMs ?? 15_000;
    if (heartbeat > 0) this.#heartbeat = setInterval(() => this.announce(), heartbeat);
    this.announce();
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    clearInterval(this.#heartbeat);
    this.#send('device/bye', {});
    for (const cleanup of this.#cleanups) cleanup();
    this.#cleanups = [];
  }

  /** Current state, as announced to hubs. */
  get state(): DeviceState {
    const match = this.router.current;
    return {
      ...(match?.screenId ? { screenId: match.screenId } : {}),
      path: match?.location.pathname ?? this.router.adapter.location.pathname,
      screens: this.store.list().map((s) => ({ id: s.id, version: s.version ?? 1, hash: contentHash(s) })),
      ...(this.#theme ? { theme: this.#theme } : {}),
      ...(this.#display ? { display: this.#display } : {}),
    };
  }

  /** Screen currently routed on this device. */
  get currentScreen(): ScreenDefinition | undefined {
    const id = this.router.current?.screenId;
    return id ? this.store.get(id) : undefined;
  }

  /** Theme to render: device override over screen theme. */
  themeFor(screen: ScreenDefinition | undefined = this.currentScreen): ThemeSpec | undefined {
    return mergeTheme(screen?.theme, this.#theme);
  }

  /** Display to render: device override merged over screen display. */
  displayFor(screen: ScreenDefinition | undefined = this.currentScreen): DisplaySpec {
    return mergeDisplay(screen?.display, this.#display);
  }

  get themeOverride(): ThemeSpec | undefined {
    return this.#theme;
  }

  get displayOverride(): DisplaySpec | undefined {
    return this.#display;
  }

  setTheme(theme: ThemeSpec | null): void {
    this.#theme = theme ? validateTheme(theme) : undefined;
    this.#saveOverrides();
    this.#stateChanged();
  }

  setDisplay(display: DisplaySpec | null, options: { merge?: boolean } = {}): void {
    const next = display ? validateDisplay(display) : undefined;
    this.#display = next && options.merge ? mergeDisplay(this.#display, next) : next;
    this.#saveOverrides();
    this.#stateChanged();
  }

  #saveOverrides(): void {
    this.#overrideStorage?.save({ ...(this.#theme ? { theme: this.#theme } : {}), ...(this.#display ? { display: this.#display } : {}) });
  }

  /** Stores a screen and shows it, as if a hub had sent it. */
  show(screen: ScreenDefinition, options: { navigate?: boolean; params?: Record<string, string> } = {}): void {
    const stored = this.store.put(validateScreen(screen), { version: 'keep' });
    if (options.navigate !== false) this.router.navigateToScreen(stored.id, options.params);
  }

  /** Broadcasts presence and state. */
  announce(): void {
    this.#send('device/hello', { device: this.#describe(), state: this.state });
  }

  subscribe(listener: Listener<DeviceEvent>): Unsubscribe {
    return this.#events.subscribe(listener);
  }

  dispose(): void {
    this.stop();
    for (const cleanup of this.#routeCleanups.values()) cleanup();
    this.#routeCleanups.clear();
    this.#events.clear();
  }

  #describe(): DeviceInfo {
    const win = globalThis as unknown as { innerWidth?: number; innerHeight?: number; devicePixelRatio?: number; navigator?: { userAgent?: string } };
    return {
      ...this.info,
      ...(this.info.viewport || win.innerWidth === undefined
        ? {}
        : { viewport: { width: win.innerWidth, height: win.innerHeight ?? 0, devicePixelRatio: win.devicePixelRatio ?? 1 } }),
      ...(this.info.userAgent || !win.navigator?.userAgent ? {} : { userAgent: win.navigator.userAgent }),
    };
  }

  #syncRoute(screen: ScreenDefinition | undefined, removedId?: string): void {
    const id = screen?.id ?? removedId!;
    const existing = this.#routeCleanups.get(id);
    if (existing && this.router.getRoute(`screen:${id}`)?.path === screen?.route) return;
    existing?.();
    this.#routeCleanups.delete(id);
    if (screen?.route) {
      this.#routeCleanups.set(id, this.router.addRoute({ id: `screen:${id}`, path: screen.route, screenId: id }));
    }
  }

  #stateChanged(): void {
    if (!this.#started) {
      this.#events.emit({ type: 'state', state: this.state });
      return;
    }
    if (this.#announceQueued) return;
    this.#announceQueued = true;
    queueMicrotask(() => {
      this.#announceQueued = false;
      const state = this.state;
      this.#events.emit({ type: 'state', state });
      this.announce();
    });
  }

  #send<T extends MessageType>(type: T, payload: MessageMap[T], to?: string): void {
    this.#transport.send(createEnvelope(type, this.info.id, payload, to) as AnyEnvelope);
  }

  #receive(message: AnyEnvelope): void {
    if (message.from === this.info.id) return;
    if (message.type === 'device/hello' || message.type === 'device/bye' || message.type === 'ack') return;
    if (!isTargeted(message.to, this.info)) return;
    if (message.type === 'hub/discover') {
      this.announce();
      return;
    }
    if (this.#options.deny?.includes(message.type) || (this.#options.accept && !this.#options.accept(message))) {
      this.#ack(message, false, 'refused');
      return;
    }
    try {
      this.#handle(message);
      this.#ack(message, true);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.#events.emit({ type: 'error', error: err, message });
      this.#ack(message, false, err.message);
    }
  }

  #handle(message: AnyEnvelope): void {
    switch (message.type) {
      case 'screen/show': {
        const { screen, navigate, params } = (message as Envelope<'screen/show'>).payload;
        this.show(screen, { navigate: navigate !== false, ...(params ? { params } : {}) });
        break;
      }
      case 'screen/patch': {
        const { screenId, patch } = (message as Envelope<'screen/patch'>).payload;
        if (typeof patch !== 'object' || patch === null) throw new Error('patch must be an object');
        const version = (message as Envelope<'screen/patch'>).payload.version;
        const previous = this.store.get(screenId);
        if (!previous) throw new Error(`Unknown screen "${screenId}"`);
        const next = applyMergePatch(previous, patch) as ScreenDefinition;
        next.id = screenId;
        next.version = version ?? (previous.version ?? 1) + 1;
        delete next.updatedAt;
        this.store.put(next, { version: 'keep' });
        break;
      }
      case 'screen/remove':
        this.store.remove((message as Envelope<'screen/remove'>).payload.screenId);
        break;
      case 'route/navigate': {
        const { path, replace } = (message as Envelope<'route/navigate'>).payload;
        if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('path must start with /');
        this.router.navigate(path, { replace: replace === true });
        break;
      }
      case 'theme/set':
        this.setTheme((message as Envelope<'theme/set'>).payload.theme);
        break;
      case 'display/set': {
        const { display, merge } = (message as Envelope<'display/set'>).payload;
        this.setDisplay(display, { merge: merge === true });
        break;
      }
      case 'device/identify':
        this.#events.emit({ type: 'identify', durationMs: (message as Envelope<'device/identify'>).payload.durationMs ?? 3000 });
        break;
      case 'custom': {
        const { name, data } = (message as Envelope<'custom'>).payload;
        this.#events.emit({ type: 'custom', name, data, from: message.from });
        break;
      }
    }
  }

  #ack(message: AnyEnvelope, ok: boolean, error?: string): void {
    this.#send('ack', { ref: message.id, ok, ...(error ? { error } : {}) }, message.from);
  }
}

export function createScreenDevice(options: ScreenDeviceOptions): ScreenDevice {
  return new ScreenDevice(options);
}

/**
 * A device id that survives reloads (localStorage), so that a hub keeps
 * recognising the same physical screen. Falls back to a random id.
 */
export function persistentDeviceId(key = 'multi-screen:device-id'): string {
  try {
    const storage = globalThis.localStorage;
    const existing = storage?.getItem(key);
    if (existing) return existing;
    const id = createId('device-').slice(0, 30);
    storage?.setItem(key, id);
    return id;
  } catch {
    return createId('device-').slice(0, 30);
  }
}
