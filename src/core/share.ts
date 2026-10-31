import { ValidationError } from './errors.js';
import type { ScreenDefinition } from './types.js';
import { validateScreen } from './validate.js';

/**
 * Encodes a screen into a URL-safe string, so that a screen can be shared as
 * a plain link (QR code, chat, e-mail) without any server.
 *
 * Format: `j.<base64url(json)>` or, when `CompressionStream` is available and
 * compression helps, `z.<base64url(deflate-raw(json))>`.
 */
export async function encodeScreen(screen: ScreenDefinition, options: { compress?: boolean } = {}): Promise<string> {
  const { version: _v, updatedAt: _u, ...portable } = validateScreen(screen);
  const bytes = new TextEncoder().encode(JSON.stringify(portable));
  if (options.compress !== false && typeof CompressionStream !== 'undefined') {
    const compressed = await transform(bytes, new CompressionStream('deflate-raw'));
    if (compressed.length < bytes.length) return `z.${toBase64Url(compressed)}`;
  }
  return `j.${toBase64Url(bytes)}`;
}

/** Decodes and validates a string produced by {@link encodeScreen}. */
export async function decodeScreen(encoded: string, options: { maxBytes?: number } = {}): Promise<ScreenDefinition> {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  if (encoded.length > maxBytes * 2) throw new ValidationError('share link too large');
  const [prefix, data] = [encoded.slice(0, 2), encoded.slice(2)];
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(data);
    if (prefix === 'z.') {
      if (typeof DecompressionStream === 'undefined') throw new ValidationError('compressed links need DecompressionStream');
      bytes = await transform(bytes, new DecompressionStream('deflate-raw'), maxBytes);
    } else if (prefix !== 'j.') {
      throw new ValidationError('unknown share format');
    }
    return validateScreen(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`invalid share link (${(error as Error).message})`);
  }
}

/**
 * Builds a share URL. By default the payload goes in the hash, so it never
 * reaches a server log: `https://app/#/share/<payload>`.
 */
export async function createShareUrl(
  screen: ScreenDefinition,
  options: { baseUrl: string; path?: (payload: string) => string; compress?: boolean },
): Promise<string> {
  const payload = await encodeScreen(screen, options.compress === undefined ? {} : { compress: options.compress });
  const path = options.path ? options.path(payload) : `#/share/${payload}`;
  return new URL(path, options.baseUrl).toString();
}

async function transform(
  bytes: Uint8Array,
  stream: { writable: WritableStream<BufferSource>; readable: ReadableStream<Uint8Array> },
  maxBytes = Infinity,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  // Errors surface through the reader; observe these promises so they are never unhandled.
  writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => undefined);
  writer.close().catch(() => undefined);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ValidationError('share link expands beyond the size limit');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
