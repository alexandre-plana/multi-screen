import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { createScreenDevice, createScreenHub, createScreenRouter, webSocketTransport, type WebSocketLike } from 'multi-screen';
import { attachWebSocketServer, createRelay } from 'multi-screen/server';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.reverse()) await c();
  cleanups = [];
});

describe('relay', () => {
  it('forwards to the room, routes by target, and refuses impersonation', () => {
    const relay = createRelay();
    const inbox = { a: [] as string[], b: [] as string[], c: [] as string[], x: [] as string[] };
    const peer = (name: keyof typeof inbox) => ({ send: (data: string) => inbox[name].push(JSON.parse(data).type) });
    const a = relay.connect(peer('a'), { room: 'r' });
    const b = relay.connect(peer('b'), { room: 'r' });
    const c = relay.connect(peer('c'), { room: 'r' });
    relay.connect(peer('x'), { room: 'other' });
    const msg = (from: string, type: string, extra: object = {}) => JSON.stringify({ ms: 1, id: Math.random().toString(), from, type, ts: 0, payload: {}, ...extra });
    b.receive(msg('b', 'device/hello', { payload: { device: { id: 'b', tags: ['wall'] } } }));
    c.receive(msg('c', 'device/hello', { payload: { device: { id: 'c' } } }));
    a.receive(msg('a', 'theme/set', { to: 'tag:wall' }));
    expect(inbox).toMatchObject({ a: ['device/hello', 'device/hello'], b: ['device/hello', 'theme/set'], c: ['device/hello'], x: [] });
    b.receive(msg('c', 'ack'));
    expect(inbox.a).toHaveLength(2);
    b.receive('not json');
    c.close();
    expect(inbox.a.at(-1)).toBe('device/bye');
    expect(relay.rooms()).toEqual([{ room: 'r', peers: 2 }, { room: 'other', peers: 1 }]);
  });

  it('connects a hub and a device over real WebSockets', async () => {
    const server = new WebSocketServer({ port: 0 });
    await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    attachWebSocketServer(server);
    cleanups.push(() => new Promise<void>((r) => server.close(() => r())));
    const url = `ws://127.0.0.1:${port}/?room=test`;
    const Ctor = WebSocket as unknown as new (url: string) => WebSocketLike;
    const hubTransport = webSocketTransport({ url, WebSocket: Ctor });
    const deviceTransport = webSocketTransport({ url, WebSocket: Ctor });
    cleanups.push(() => hubTransport.close(), () => deviceTransport.close());
    const device = createScreenDevice({ transport: deviceTransport, info: { id: 'tv', name: 'TV' }, router: createScreenRouter(), heartbeatMs: 0 });
    const hub = createScreenHub({ transport: hubTransport, ackTimeoutMs: 1000 });
    cleanups.push(() => hub.dispose(), () => device.dispose());
    for (let i = 0; i < 50 && !hub.device('tv'); i++) await wait(20);
    expect(hub.device('tv')?.info.name).toBe('TV');
    const result = await hub.show('tv', { id: 'news', panels: [{ id: 'p', component: 'ms:text' }] });
    expect(result.ok).toBe(true);
    expect(device.router.current?.screenId).toBe('news');
  });

  it('re-announces devices as soon as the relay comes back', async () => {
    const server = new WebSocketServer({ port: 0 });
    await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    const relay = attachWebSocketServer(server);
    const url = `ws://127.0.0.1:${port}/`;
    const Ctor = WebSocket as unknown as new (url: string) => WebSocketLike;
    const hubTransport = webSocketTransport({ url, WebSocket: Ctor, minDelayMs: 50, maxDelayMs: 100 });
    const deviceTransport = webSocketTransport({ url, WebSocket: Ctor, minDelayMs: 50, maxDelayMs: 100 });
    const device = createScreenDevice({ transport: deviceTransport, info: { id: 'tv' }, heartbeatMs: 0 });
    const hub = createScreenHub({ transport: hubTransport, ackTimeoutMs: 500 });
    cleanups.push(() => new Promise<void>((r) => server.close(() => r())), () => hubTransport.close(), () => deviceTransport.close(), () => hub.dispose(), () => device.dispose());
    for (let i = 0; i < 50 && !hub.device('tv')?.online; i++) await wait(20);
    const before = hub.device('tv')!.lastSeen;
    await wait(30);
    relay.close(); // drops every socket; both sides reconnect
    // Heartbeat is off: only the reconnect hook can produce a new announce.
    for (let i = 0; i < 100 && hub.device('tv')!.lastSeen === before; i++) await wait(20);
    expect(hub.device('tv')!.lastSeen).toBeGreaterThan(before);
    expect((await hub.identify('tv')).ok).toBe(true);
  });
});
