/**
 * JSON Merge Patch (RFC 7396): the update format used to modify a screen
 * remotely. `null` deletes a key, objects are merged, everything else
 * (including arrays) replaces the target value.
 */
export type MergePatch<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: MergePatch<T[K]> | null }
    : T;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function applyMergePatch<T>(target: T, patch: unknown): T {
  if (!isPlainObject(patch)) return structuredClone(patch) as T;
  const result: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (value === null) delete result[key];
    else if (value !== undefined) result[key] = applyMergePatch(result[key], value);
  }
  return result as T;
}

/** Computes the merge patch that turns `from` into `to`. */
export function createMergePatch(from: unknown, to: unknown): unknown {
  if (!isPlainObject(from) || !isPlainObject(to)) return structuredClone(to);
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(from)) {
    if (!(key in to) || to[key] === undefined) patch[key] = null;
  }
  for (const [key, value] of Object.entries(to)) {
    if (value === undefined) continue;
    if (!deepEqual(from[key], value)) {
      patch[key] = isPlainObject(from[key]) && isPlainObject(value) ? createMergePatch(from[key], value) : structuredClone(value);
    }
  }
  return patch;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** JSON with sorted keys: equal values give equal strings. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** Short, stable fingerprint of a screen's content (version and date excluded). FNV-1a 32 bits. */
export function contentHash(screen: { version?: number; updatedAt?: string }): string {
  const { version: _v, updatedAt: _u, ...content } = screen;
  const text = canonicalJson(content);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
