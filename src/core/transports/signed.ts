import { canonicalJson } from '../patch.js';
import type { AnyEnvelope, Transport } from '../protocol.js';

export interface SignedTransportOptions {
  /** Shared secret (string) or an HMAC `CryptoKey` (SHA-256). */
  secret: string | CryptoKey;
  /** Messages older or newer than this are refused (replay protection). Default 60 s. */
  maxSkewMs?: number;
  /** Called for every refused incoming message. */
  onReject?: (reason: 'unsigned' | 'bad-signature' | 'expired' | 'replayed', message: AnyEnvelope) => void;
}

type Signed = AnyEnvelope & { sig?: string };

/**
 * Wraps a transport so that every message is signed with HMAC-SHA256, and
 * only correctly signed, fresh, never-seen messages are delivered. Every
 * peer sharing the secret is trusted; the others are ignored. Order is
 * preserved in both directions.
 */
export function signedTransport(inner: Transport, options: SignedTransportOptions): Transport {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('signedTransport needs WebCrypto (crypto.subtle): use https or localhost');
  const maxSkew = options.maxSkewMs ?? 60_000;
  const key: Promise<CryptoKey> =
    typeof options.secret === 'string'
      ? subtle.importKey('raw', new TextEncoder().encode(options.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
      : Promise.resolve(options.secret);
  const listeners = new Set<(message: AnyEnvelope) => void>();
  const seen = new Map<string, number>();
  let sendChain: Promise<unknown> = Promise.resolve();
  let receiveChain: Promise<unknown> = Promise.resolve();

  const payloadOf = (message: Signed) => {
    const { sig: _sig, ...rest } = message;
    return new TextEncoder().encode(canonicalJson(rest));
  };

  const prune = (now: number) => {
    for (const [id, ts] of seen) if (now - ts > maxSkew * 2) seen.delete(id);
  };

  const verify = async (message: Signed): Promise<void> => {
    const reject = (reason: Parameters<NonNullable<SignedTransportOptions['onReject']>>[0]) => options.onReject?.(reason, message);
    if (typeof message.sig !== 'string') return reject('unsigned');
    const now = Date.now();
    if (typeof message.ts !== 'number' || Math.abs(now - message.ts) > maxSkew) return reject('expired');
    let ok = false;
    try {
      ok = await subtle.verify('HMAC', await key, fromHex(message.sig), payloadOf(message));
    } catch {
      ok = false;
    }
    if (!ok) return reject('bad-signature');
    if (seen.has(message.id)) return reject('replayed');
    seen.set(message.id, now);
    prune(now);
    const { sig: _sig, ...clean } = message;
    for (const listener of [...listeners]) listener(clean as AnyEnvelope);
  };

  const unsubscribe = inner.subscribe((message) => {
    receiveChain = receiveChain.then(() => verify(message as Signed)).catch(() => undefined);
  });

  return {
    send(message) {
      sendChain = sendChain
        .then(async () => {
          const signature = await subtle.sign('HMAC', await key, payloadOf(message));
          inner.send({ ...message, sig: toHex(new Uint8Array(signature)) } as unknown as AnyEnvelope);
        })
        .catch(() => undefined);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...(inner.onOpen ? { onOpen: (listener: () => void) => inner.onOpen!(listener) } : {}),
    close() {
      unsubscribe();
      listeners.clear();
      inner.close?.();
    },
  };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
