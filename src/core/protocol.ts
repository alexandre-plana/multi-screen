import type { DeviceInfo, DeviceState, DisplaySpec, ScreenDefinition, ThemeSpec } from './types.js';

/** Version of the wire protocol. Bumped on breaking changes only. */
export const PROTOCOL_VERSION = 1;

/**
 * Message targets:
 * - a device id,
 * - `tag:<tag>` for every device carrying that tag,
 * - `*` for every device.
 */
export type Target = string | string[];

/** Every message exchanged between hubs and devices. */
export interface MessageMap {
  /** Hub → devices: ask every device to announce itself. */
  'hub/discover': Record<string, never>;
  /** Device → all: presence and current state (on join, on change, heartbeat). */
  'device/hello': { device: DeviceInfo; state: DeviceState };
  /** Device → all: the device leaves. */
  'device/bye': Record<string, never>;
  /** Hub → device: store a screen, optionally show it. */
  'screen/show': { screen: ScreenDefinition; navigate?: boolean; params?: Record<string, string> };
  /** Hub → device: update a stored screen with a JSON merge patch. */
  'screen/patch': { screenId: string; patch: Record<string, unknown>; version?: number };
  /** Hub → device: forget a screen. */
  'screen/remove': { screenId: string };
  /** Hub → device: navigate the device router. */
  'route/navigate': { path: string; replace?: boolean };
  /** Hub → device: device-level theme override (`null` clears it). */
  'theme/set': { theme: ThemeSpec | null };
  /** Hub → device: device-level display override (`null` clears it, `merge` keeps other fields). */
  'display/set': { display: DisplaySpec | null; merge?: boolean };
  /** Hub → device: flash the device name so a human can spot it. */
  'device/identify': { durationMs?: number };
  /** Hub → device: application-defined command. */
  'custom': { name: string; data?: unknown };
  /** Device → hub: result of a command. */
  'ack': { ref: string; ok: boolean; error?: string };
}

export type MessageType = keyof MessageMap;

export interface Envelope<T extends MessageType = MessageType> {
  /** Protocol marker, lets transports share a channel with other traffic. */
  ms: typeof PROTOCOL_VERSION;
  id: string;
  type: T;
  /** Sender id (hub or device). */
  from: string;
  /** Recipients; omitted means everybody. */
  to?: Target;
  /** Sender clock, ms since epoch. */
  ts: number;
  payload: MessageMap[T];
}

export type AnyEnvelope = { [T in MessageType]: Envelope<T> }[MessageType];

const TYPES = new Set<string>([
  'hub/discover', 'device/hello', 'device/bye', 'screen/show', 'screen/patch', 'screen/remove',
  'route/navigate', 'theme/set', 'display/set', 'device/identify', 'custom', 'ack',
]);

let counter = 0;
export function createId(prefix = ''): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix + random;
}

export function createEnvelope<T extends MessageType>(type: T, from: string, payload: MessageMap[T], to?: Target): Envelope<T> {
  return { ms: PROTOCOL_VERSION, id: createId(), type, from, ...(to === undefined ? {} : { to }), ts: Date.now(), payload };
}

/** Structural check of an incoming message; payloads are validated by the receiver. */
export function isEnvelope(value: unknown): value is AnyEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.ms === PROTOCOL_VERSION &&
    typeof v.id === 'string' &&
    typeof v.type === 'string' &&
    TYPES.has(v.type) &&
    typeof v.from === 'string' &&
    isTarget(v.to) &&
    typeof v.payload === 'object' &&
    v.payload !== null
  );
}

function isTarget(to: unknown): boolean {
  return to === undefined || typeof to === 'string' || (Array.isArray(to) && to.every((t) => typeof t === 'string'));
}

/** Whether a message addressed to `to` concerns the given device. */
export function isTargeted(to: Target | undefined, device: Pick<DeviceInfo, 'id' | 'tags'>): boolean {
  if (to === undefined) return true;
  const targets = Array.isArray(to) ? to : [to];
  return targets.some((t) => typeof t === 'string' && (t === '*' || t === device.id || (t.startsWith('tag:') && (device.tags ?? []).includes(t.slice(4)))));
}

/** Transport: moves envelopes between peers. Implementations must not echo a message back to its sender. */
export interface Transport {
  send(message: AnyEnvelope): void;
  subscribe(listener: (message: AnyEnvelope) => void): () => void;
  close?(): void;
  /**
   * Optional: called each time the link (re)opens, so peers can re-announce
   * themselves instead of waiting for the next heartbeat.
   */
  onOpen?(listener: () => void): () => void;
}
