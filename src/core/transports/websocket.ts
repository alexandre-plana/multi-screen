import { isEnvelope, type AnyEnvelope, type Transport } from '../protocol.js';

/** The subset of the WebSocket API this transport needs (browser, Node 22+, `ws`, Deno, Bun). */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export interface WebSocketTransportOptions {
  /** `ws://` / `wss://` URL, e.g. of the relay shipped in `multi-screen/server`. */
  url: string | (() => string);
  protocols?: string | string[];
  /** WebSocket constructor (defaults to the global one). */
  WebSocket?: new (url: string, protocols?: string | string[]) => WebSocketLike;
  /** Reconnects automatically with exponential backoff. Default true. */
  reconnect?: boolean;
  minDelayMs?: number;
  maxDelayMs?: number;
  /** Max messages buffered while disconnected. Default 500. */
  maxQueue?: number;
  /**
   * Buffered messages older than this are dropped on reconnect, so that a
   * command the sender already gave up on is not executed much later. Default 10 s.
   */
  maxQueueAgeMs?: number;
  /** Connection status changes. */
  onStatus?: (status: 'connecting' | 'open' | 'closed') => void;
}

export interface WebSocketTransport extends Transport {
  readonly status: 'connecting' | 'open' | 'closed';
  close(): void;
}

/** Network transport with reconnection and an outgoing queue. */
export function webSocketTransport(options: WebSocketTransportOptions): WebSocketTransport {
  const Ctor = options.WebSocket ?? (globalThis as unknown as { WebSocket?: WebSocketTransportOptions['WebSocket'] }).WebSocket;
  if (!Ctor) throw new Error('No WebSocket implementation available: pass options.WebSocket');
  const listeners = new Set<(message: AnyEnvelope) => void>();
  const openListeners = new Set<() => void>();
  const queue: { data: string; at: number }[] = [];
  const maxAge = options.maxQueueAgeMs ?? 10_000;
  const maxQueue = options.maxQueue ?? 500;
  let socket: WebSocketLike | undefined;
  let status: WebSocketTransport['status'] = 'connecting';
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const setStatus = (next: WebSocketTransport['status']) => {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  };

  const connect = () => {
    if (closed) return;
    setStatus('connecting');
    let ws: WebSocketLike;
    try {
      const url = typeof options.url === 'function' ? options.url() : options.url;
      ws = new Ctor(url, options.protocols);
    } catch {
      // Bad URL or constructor failure: keep retrying rather than stopping for good.
      setStatus('closed');
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      setStatus('open');
      for (const listener of [...openListeners]) listener();
      const now = Date.now();
      while (queue.length && ws.readyState === 1) {
        const item = queue.shift()!;
        if (now - item.at <= maxAge) ws.send(item.data);
      }
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!isEnvelope(data)) return;
      for (const listener of [...listeners]) listener(data);
    };
    ws.onerror = () => undefined;
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = undefined;
      setStatus('closed');
      scheduleReconnect();
    };
  };
  const scheduleReconnect = () => {
    if (closed || options.reconnect === false) return;
    const min = options.minDelayMs ?? 500;
    const delay = Math.min(options.maxDelayMs ?? 15_000, min * 2 ** attempt++) * (0.75 + Math.random() * 0.5);
    timer = setTimeout(connect, delay);
  };
  connect();

  return {
    get status() {
      return status;
    },
    send(message) {
      const data = JSON.stringify(message);
      if (socket && socket.readyState === 1) socket.send(data);
      else {
        queue.push({ data, at: Date.now() });
        if (queue.length > maxQueue) queue.shift();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onOpen(listener) {
      openListeners.add(listener);
      return () => openListeners.delete(listener);
    },
    close() {
      closed = true;
      openListeners.clear();
      clearTimeout(timer);
      listeners.clear();
      const ws = socket;
      socket = undefined;
      ws?.close(1000, 'closed');
      setStatus('closed');
    },
  };
}
