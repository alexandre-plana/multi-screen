import { isEnvelope, type AnyEnvelope, type Transport } from '../protocol.js';

/**
 * Same-origin tabs, windows and workers of one browser (BroadcastChannel).
 * Zero setup: perfect for a control window driving screens on the same
 * machine (video walls, second monitors).
 */
export function broadcastChannelTransport(name = 'multi-screen'): Transport {
  const channel = new BroadcastChannel(name);
  const listeners = new Set<(message: AnyEnvelope) => void>();
  channel.onmessage = (event: MessageEvent) => {
    if (!isEnvelope(event.data)) return;
    for (const listener of [...listeners]) listener(event.data);
  };
  return {
    send: (message) => channel.postMessage(message),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      channel.close();
    },
  };
}
