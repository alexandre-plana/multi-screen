import type { AnyEnvelope, Transport } from '../protocol.js';

/**
 * In-process bus: every transport created by `connect()` receives the
 * messages of the others. Delivery is asynchronous (microtask) like a real
 * network. Ideal for tests and single-page previews.
 */
export function createMemoryBus(): { connect(): Transport; readonly peers: number } {
  const peers = new Set<(message: AnyEnvelope) => void>();
  return {
    get peers() {
      return peers.size;
    },
    connect() {
      const listeners = new Set<(message: AnyEnvelope) => void>();
      const receive = (message: AnyEnvelope) => {
        for (const listener of [...listeners]) listener(structuredClone(message));
      };
      peers.add(receive);
      return {
        send(message) {
          for (const peer of peers) if (peer !== receive) queueMicrotask(() => peer(message));
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        close() {
          peers.delete(receive);
          listeners.clear();
        },
      };
    },
  };
}
