import { Emitter, type Listener, type Unsubscribe } from './emitter.js';
import { contentHash, createMergePatch, type MergePatch } from './patch.js';
import { createEnvelope, createId, isTargeted, type AnyEnvelope, type Envelope, type MessageMap, type MessageType, type Target, type Transport } from './protocol.js';
import { ScreenStore } from './store.js';
import type { DeviceInfo, DeviceState, DisplaySpec, ScreenDefinition, ThemeSpec } from './types.js';
import { validateDeviceInfo, validateScreen } from './validate.js';

export interface DeviceRecord {
  info: DeviceInfo;
  state: DeviceState;
  /** ms since epoch of the last message received from the device. */
  lastSeen: number;
  online: boolean;
}

export interface Ack {
  deviceId: string;
  ok: boolean;
  error?: string;
}

export interface CommandResult {
  messageId: string;
  /** Devices that were expected to answer (online devices matching the target). */
  expected: string[];
  acks: Ack[];
  /** Expected devices that did not answer in time. */
  missing: string[];
  ok: boolean;
}

export type HubEvent =
  | { type: 'devices'; devices: DeviceRecord[] }
  | { type: 'device'; device: DeviceRecord; change: 'joined' | 'updated' | 'left' | 'offline' }
  | { type: 'ack'; ack: Ack; ref: string };

export interface ScreenHubOptions {
  transport: Transport;
  /** Hub id. Random by default. */
  id?: string;
  /** Screens managed by the hub (the "library"). */
  store?: ScreenStore;
  /** A device is offline after this delay without message. Default 45 s. */
  staleAfterMs?: number;
  /** Time to wait for acknowledgements. Default 5 s. */
  ackTimeoutMs?: number;
  /** Return false to ignore a device (authorisation). */
  acceptDevice?: (info: DeviceInfo, message: AnyEnvelope) => boolean;
}

interface Pending {
  expected: Set<string>;
  acks: Ack[];
  resolve: (result: CommandResult) => void;
  timer: ReturnType<typeof setTimeout>;
  messageId: string;
}

/**
 * The controlling end: discovers devices and sends them screens, updates,
 * themes, display settings and navigation commands.
 */
export class ScreenHub {
  readonly id: string;
  readonly store: ScreenStore;
  readonly #transport: Transport;
  readonly #devices = new Map<string, DeviceRecord>();
  readonly #pending = new Map<string, Pending>();
  readonly #events = new Emitter<HubEvent>();
  readonly #options: ScreenHubOptions;
  readonly #unsubscribe: Unsubscribe;
  readonly #sweeper: ReturnType<typeof setInterval>;

  constructor(options: ScreenHubOptions) {
    this.#options = options;
    this.id = options.id ?? createId('hub-').slice(0, 30);
    this.store = options.store ?? new ScreenStore();
    this.#transport = options.transport;
    this.#unsubscribe = this.#transport.subscribe((message) => this.#receive(message));
    const stale = options.staleAfterMs ?? 45_000;
    this.#sweeper = setInterval(() => this.#sweep(), Math.max(250, stale / 3));
    (this.#sweeper as { unref?: () => void }).unref?.();
    this.discover();
  }

  /** Known devices, most recently seen first. */
  devices(): DeviceRecord[] {
    return [...this.#devices.values()].sort((a, b) => b.lastSeen - a.lastSeen).map((d) => structuredClone(d));
  }

  device(id: string): DeviceRecord | undefined {
    const record = this.#devices.get(id);
    return record && structuredClone(record);
  }

  /** Ids of the online devices matching a target. */
  resolveTarget(target: Target): string[] {
    return [...this.#devices.values()].filter((d) => d.online && isTargeted(target, d.info)).map((d) => d.info.id);
  }

  /** Asks every device to announce itself. */
  discover(): void {
    this.#transport.send(createEnvelope('hub/discover', this.id, {}) as AnyEnvelope);
  }

  /** Sends a screen (object or id of a screen of the hub store) and shows it. */
  show(target: Target, screen: ScreenDefinition | string, options: { navigate?: boolean; params?: Record<string, string> } = {}): Promise<CommandResult> {
    const definition = typeof screen === 'string' ? this.store.get(screen) : validateScreen(screen);
    if (!definition) return Promise.reject(new Error(`Unknown screen "${String(screen)}"`));
    return this.send(target, 'screen/show', { screen: definition, navigate: options.navigate !== false, ...(options.params ? { params: options.params } : {}) });
  }

  /** Sends a merge patch for a screen already present on the targets. */
  patch(target: Target, screenId: string, patch: MergePatch<ScreenDefinition> | Record<string, unknown>, version?: number): Promise<CommandResult> {
    return this.send(target, 'screen/patch', { screenId, patch: patch as Record<string, unknown>, ...(version === undefined ? {} : { version }) });
  }

  /**
   * Updates a screen of the hub store and propagates the change to every
   * device holding it: a patch for devices up to date, the full screen for
   * the others. Devices that show it re-render live.
   */
  async update(screenId: string, change: MergePatch<ScreenDefinition> | Record<string, unknown> | ((screen: ScreenDefinition) => ScreenDefinition)): Promise<CommandResult[]> {
    const previous = this.store.get(screenId);
    if (!previous) throw new Error(`Unknown screen "${screenId}"`);
    const next = typeof change === 'function' ? this.store.put({ ...change(previous), id: screenId }) : this.store.patch(screenId, change);
    return this.sync(next.id, previous);
  }

  /** Pushes the hub's version of a screen to every device holding an older one. */
  async sync(screenId: string, previous?: ScreenDefinition): Promise<CommandResult[]> {
    const screen = this.store.get(screenId);
    if (!screen) throw new Error(`Unknown screen "${screenId}"`);
    const upToDate: string[] = [];
    const stale: string[] = [];
    const hash = contentHash(screen);
    const previousHash = previous && contentHash(previous);
    for (const device of this.#devices.values()) {
      if (!device.online) continue;
      const held = device.state.screens.find((s) => s.id === screenId);
      if (!held) continue;
      // Without a hash (custom device), trust the version.
      if (held.hash ? held.hash === hash : held.version === screen.version) continue;
      if (previous && held.version === previous.version && (!held.hash || held.hash === previousHash)) upToDate.push(device.info.id);
      else stale.push(device.info.id);
    }
    const results: Promise<CommandResult>[] = [];
    if (upToDate.length && previous) {
      const { version: _v, updatedAt: _u, ...from } = previous;
      const { version: _v2, updatedAt: _u2, ...to } = screen;
      results.push(this.patch(upToDate, screenId, createMergePatch(from, to) as Record<string, unknown>, screen.version));
    }
    if (stale.length) results.push(this.show(stale, screen, { navigate: false }));
    return Promise.all(results);
  }

  remove(target: Target, screenId: string): Promise<CommandResult> {
    return this.send(target, 'screen/remove', { screenId });
  }

  navigate(target: Target, path: string, options: { replace?: boolean } = {}): Promise<CommandResult> {
    return this.send(target, 'route/navigate', { path, ...(options.replace ? { replace: true } : {}) });
  }

  /** Device-level theme override; `null` restores the screens' own themes. */
  setTheme(target: Target, theme: ThemeSpec | null): Promise<CommandResult> {
    return this.send(target, 'theme/set', { theme });
  }

  /** Device-level display override; `merge` keeps the fields not given. */
  setDisplay(target: Target, display: DisplaySpec | null, options: { merge?: boolean } = {}): Promise<CommandResult> {
    return this.send(target, 'display/set', { display, ...(options.merge ? { merge: true } : {}) });
  }

  identify(target: Target, durationMs = 3000): Promise<CommandResult> {
    return this.send(target, 'device/identify', { durationMs });
  }

  /** Application-defined command, received as a `custom` event on devices. */
  command(target: Target, name: string, data?: unknown): Promise<CommandResult> {
    return this.send(target, 'custom', { name, data });
  }

  /** Low-level send; resolves when every expected device acknowledged, or on timeout. */
  send<T extends MessageType>(target: Target, type: T, payload: MessageMap[T]): Promise<CommandResult> {
    const message = createEnvelope(type, this.id, payload, target) as AnyEnvelope;
    const expected = new Set(this.resolveTarget(target));
    return new Promise<CommandResult>((resolve) => {
      const finish = () => {
        clearTimeout(pending.timer);
        this.#pending.delete(message.id);
        const answered = new Set(pending.acks.map((a) => a.deviceId));
        const missing = [...expected].filter((id) => !answered.has(id));
        resolve({ messageId: message.id, expected: [...expected], acks: pending.acks, missing, ok: missing.length === 0 && pending.acks.every((a) => a.ok) });
      };
      const pending: Pending = { expected, acks: [], resolve: finish, messageId: message.id, timer: setTimeout(finish, this.#options.ackTimeoutMs ?? 5000) };
      this.#pending.set(message.id, pending);
      this.#transport.send(message);
      if (expected.size === 0 && !(typeof target === 'string' && target === '*')) {
        // Nobody known matches: do not wait for nothing.
        queueMicrotask(finish);
      }
    });
  }

  subscribe(listener: Listener<HubEvent>): Unsubscribe {
    return this.#events.subscribe(listener);
  }

  dispose(): void {
    clearInterval(this.#sweeper);
    this.#unsubscribe();
    for (const pending of this.#pending.values()) pending.resolve({} as CommandResult);
    this.#events.clear();
  }

  #receive(message: AnyEnvelope): void {
    if (message.from === this.id) return;
    if (message.type === 'device/hello') {
      const { device, state } = (message as Envelope<'device/hello'>).payload;
      let info: DeviceInfo;
      try {
        info = validateDeviceInfo(device);
      } catch {
        return;
      }
      if (info.id !== message.from) return;
      if (this.#options.acceptDevice && !this.#options.acceptDevice(info, message)) return;
      const existing = this.#devices.get(info.id);
      const record: DeviceRecord = { info, state: sanitizeState(state), lastSeen: Date.now(), online: true };
      this.#devices.set(info.id, record);
      this.#emitDevice(record, existing && existing.online ? 'updated' : 'joined');
    } else if (message.type === 'device/bye') {
      const existing = this.#devices.get(message.from);
      if (!existing) return;
      existing.online = false;
      this.#emitDevice(existing, 'left');
    } else if (message.type === 'ack') {
      const { ref, ok, error } = (message as Envelope<'ack'>).payload;
      const device = this.#devices.get(message.from);
      if (device) device.lastSeen = Date.now();
      const pending = this.#pending.get(ref);
      const ack: Ack = { deviceId: message.from, ok: ok === true, ...(error ? { error: String(error) } : {}) };
      this.#events.emit({ type: 'ack', ack, ref });
      if (!pending) return;
      pending.acks.push(ack);
      if ([...pending.expected].every((id) => pending.acks.some((a) => a.deviceId === id)) && pending.expected.size > 0) pending.resolve({} as CommandResult);
    }
  }

  #emitDevice(record: DeviceRecord, change: 'joined' | 'updated' | 'left' | 'offline'): void {
    this.#events.emit({ type: 'device', device: structuredClone(record), change });
    this.#events.emit({ type: 'devices', devices: this.devices() });
  }

  #sweep(): void {
    const stale = this.#options.staleAfterMs ?? 45_000;
    const now = Date.now();
    for (const record of this.#devices.values()) {
      if (record.online && now - record.lastSeen > stale) {
        record.online = false;
        this.#emitDevice(record, 'offline');
      }
    }
  }
}

function sanitizeState(state: unknown): DeviceState {
  const s = (typeof state === 'object' && state !== null ? state : {}) as Partial<DeviceState>;
  return {
    ...s,
    screens: Array.isArray(s.screens) ? s.screens.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, version: Number(x.version) || 0, ...(typeof x.hash === 'string' ? { hash: x.hash } : {}) })) : [],
  };
}

export function createScreenHub(options: ScreenHubOptions): ScreenHub {
  return new ScreenHub(options);
}
