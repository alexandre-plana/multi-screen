import { isEnvelope, type AnyEnvelope, type Transport } from '../protocol.js';

export interface PostMessageTransportOptions {
  /** Where messages are sent: an iframe's `contentWindow`, a popup, `window.parent`… */
  target: Window | (() => Window | null | undefined);
  /** Origin of the target. Use the exact origin in production, never `*` with sensitive data. */
  targetOrigin: string;
  /** Window listening for messages. Default `globalThis`. */
  self?: Window;
  /** Accepted origins for incoming messages. Default: `targetOrigin` (any if `*`). */
  allowedOrigins?: string[];
}

/** Window ↔ iframe / popup messaging (`window.postMessage`). */
export function postMessageTransport(options: PostMessageTransportOptions): Transport {
  const self = options.self ?? (globalThis as unknown as Window);
  const allowed = options.allowedOrigins ?? (options.targetOrigin === '*' ? undefined : [options.targetOrigin]);
  const listeners = new Set<(message: AnyEnvelope) => void>();
  const onMessage = (event: MessageEvent) => {
    if (allowed && !allowed.includes(event.origin)) return;
    if (!isEnvelope(event.data)) return;
    for (const listener of [...listeners]) listener(event.data);
  };
  self.addEventListener('message', onMessage);
  const resolveTarget = () => (typeof options.target === 'function' ? options.target() : options.target);
  return {
    send(message) {
      resolveTarget()?.postMessage(message, options.targetOrigin);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      self.removeEventListener('message', onMessage);
    },
  };
}
