/**
 * Message relay for the WebSocket transport. Runtime-agnostic: it only needs
 * peers able to `send(string)`. Adapters for `ws`, Deno, Bun or Cloudflare
 * Workers are a few lines (see {@link attachWebSocketServer}).
 *
 * The relay groups peers by room and forwards every valid message to the
 * other peers of the room. Recipients filter by `to` themselves, so the
 * relay stays stateless about screens.
 */
export interface RelayPeer {
  send(data: string): void;
  close?(code?: number, reason?: string): void;
}

export interface RelayOptions {
  /** Max message size in bytes. Default 1 MiB. */
  maxMessageBytes?: number;
  /** Return false to refuse a message (auth, rate limiting…). */
  authorize?: (message: Record<string, unknown>, connection: RelayConnection) => boolean;
  /** Only forward messages to peers targeted by `to` (uses `device/hello` to learn ids and tags). Default true. */
  route?: boolean;
}

export interface RelayConnection {
  readonly room: string;
  /** Id announced by the peer (hub or device), once known. */
  readonly peerId: string | undefined;
  readonly tags: readonly string[];
  /** Feed a raw incoming frame. */
  receive(data: string): void;
  close(): void;
}

export interface Relay {
  connect(peer: RelayPeer, options?: { room?: string }): RelayConnection;
  rooms(): { room: string; peers: number }[];
  close(): void;
}

interface Connection extends RelayConnection {
  peer: RelayPeer;
  peerId: string | undefined;
  tags: string[];
}

export function createRelay(options: RelayOptions = {}): Relay {
  const rooms = new Map<string, Set<Connection>>();
  const maxBytes = options.maxMessageBytes ?? 1024 * 1024;
  const routing = options.route !== false;

  const targets = (to: unknown, conn: Connection) => {
    if (!routing || to === undefined || conn.peerId === undefined) return true;
    const list = Array.isArray(to) ? to : [to];
    return list.some((t) => t === '*' || t === conn.peerId || (typeof t === 'string' && t.startsWith('tag:') && conn.tags.includes(t.slice(4))));
  };

  return {
    connect(peer, { room = 'default' } = {}) {
      const members = rooms.get(room) ?? new Set<Connection>();
      rooms.set(room, members);
      const conn: Connection = {
        room,
        peer,
        peerId: undefined,
        tags: [],
        receive(data) {
          if (data.length > maxBytes) return;
          let message: Record<string, unknown>;
          try {
            message = JSON.parse(data) as Record<string, unknown>;
          } catch {
            return;
          }
          if (typeof message !== 'object' || message === null || message.ms !== 1 || typeof message.from !== 'string') return;
          // A peer cannot impersonate another one once identified.
          if (conn.peerId === undefined) conn.peerId = message.from;
          else if (message.from !== conn.peerId) return;
          if (message.type === 'device/hello') {
            const device = (message.payload as { device?: { tags?: unknown } } | undefined)?.device;
            conn.tags = Array.isArray(device?.tags) ? device.tags.filter((t): t is string => typeof t === 'string') : [];
          }
          if (options.authorize && !options.authorize(message, conn)) return;
          for (const other of members) {
            if (other === conn || !targets(message.to, other)) continue;
            try {
              other.peer.send(data);
            } catch {
              // Broken peer: it will be removed on close.
            }
          }
        },
        close() {
          members.delete(conn);
          if (members.size === 0) rooms.delete(room);
          // Tell the room the device is gone, as it could not say it itself.
          if (conn.peerId) {
            const bye = JSON.stringify({ ms: 1, id: `bye-${conn.peerId}-${Date.now()}`, type: 'device/bye', from: conn.peerId, ts: Date.now(), payload: {} });
            for (const other of members) {
              try {
                other.peer.send(bye);
              } catch {
                /* ignore */
              }
            }
          }
        },
      };
      members.add(conn);
      return conn;
    },
    rooms() {
      return [...rooms].map(([room, peers]) => ({ room, peers: peers.size }));
    },
    close() {
      for (const members of rooms.values()) for (const conn of members) conn.peer.close?.(1001, 'relay closed');
      rooms.clear();
    },
  };
}

/** Minimal shape of a `ws` WebSocketServer. */
interface WsServerLike {
  on(event: 'connection', listener: (socket: WsSocketLike, request: { url?: string }) => void): unknown;
}
interface WsSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: unknown, isBinary?: boolean) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
}

/**
 * Plugs a relay into a `ws` WebSocketServer. The room is read from the
 * `room` query parameter: `ws://host:8787/?room=lobby`.
 */
export function attachWebSocketServer(server: WsServerLike, relay: Relay = createRelay()): Relay {
  server.on('connection', (socket, request) => {
    const room = new URL(request.url ?? '/', 'http://relay').searchParams.get('room') ?? 'default';
    const conn = relay.connect({ send: (data) => socket.send(data), close: (c, r) => socket.close(c, r) }, { room });
    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      conn.receive(String(data));
    });
    socket.on('close', () => conn.close());
  });
  return relay;
}
