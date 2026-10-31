// Regression tests for the defects found in the code review.
import { describe, expect, it, vi } from 'vitest';
import {
  createEnvelope, createMemoryBus, createScreenDevice, createScreenHub, createScreenRouter, createScreenStore, decodeScreen,
  isEnvelope, isTargeted, memoryRouter, validateScreen, ValidationError, webSocketTransport, type AnyEnvelope, type ScreenDefinition, type WebSocketLike,
} from 'multi-screen';
import { createRelay } from 'multi-screen/server';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('untrusted messages', () => {
  it('rejects envelopes whose `to` is not a string or string list, and never throws on targets', () => {
    const base = createEnvelope('hub/discover', 'h', {});
    for (const to of [5, null, [1], { a: 1 }]) expect(isEnvelope({ ...base, to })).toBe(false);
    expect(isEnvelope({ ...base, to: ['a', 'tag:b'] })).toBe(true);
    expect(isTargeted([5 as unknown as string, 'd'], { id: 'd' })).toBe(true);
  });

  it('refuses an invalid route pattern with a failed ack', async () => {
    expect(() => validateScreen({ id: 's', route: '/a(b' })).toThrow(ValidationError);
    const bus = createMemoryBus();
    const hub = createScreenHub({ transport: bus.connect(), ackTimeoutMs: 200 });
    const device = createScreenDevice({ transport: bus.connect(), info: { id: 'd' }, heartbeatMs: 0, router: createScreenRouter() });
    await flush();
    // hub.show validates locally; a hostile or buggy peer can still send it raw.
    await expect(hub.show('d', { id: 's', route: '/a(b' })).rejects.toBeInstanceOf(ValidationError);
    const result = await hub.send('d', 'screen/show', { screen: { id: 's', route: '/a(b' } });
    expect(result.ok).toBe(false);
    expect(result.acks[0]?.error).toMatch(/screen.route/);
    hub.dispose();
    device.dispose();
  });

  it('does not crash on malformed percent-encoding in the URL', () => {
    const router = createScreenRouter({ adapter: memoryRouter('/screens/%ZZ') });
    expect(router.current?.screenId).toBe('%ZZ');
    router.navigate('/screens/%E0%A4%A');
    expect(router.current?.route.id).toBe('multi-screen:screen');
  });

  it('caps decompressed share links and never leaks unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await expect(decodeScreen('z.AAAAAAAA')).rejects.toBeInstanceOf(ValidationError);
    // ~1 MB of a single repeated character compresses to almost nothing.
    const big = { id: 'big', meta: { pad: 'x'.repeat(2_000_000) } } as ScreenDefinition;
    const { encodeScreen } = await import('multi-screen');
    const link = await encodeScreen(big);
    expect(link.startsWith('z.')).toBe(true);
    await expect(decodeScreen(link)).rejects.toThrow(/size limit/);
    await expect(decodeScreen(link, { maxBytes: 3_000_000 })).resolves.toMatchObject({ id: 'big' });
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('router ordering', () => {
  it('tries catch-all routes after more specific ones', () => {
    const router = createScreenRouter();
    router.addRoute({ path: '/files/*rest', screenId: 'browser' });
    router.addRoute({ path: '/files/:id/edit', screenId: 'editor' });
    expect(router.match('/files/42/edit')?.screenId).toBe('editor');
    expect(router.match('/files/a/b/c')?.screenId).toBe('browser');
  });
});

describe('store loading', () => {
  it('keeps screens written before the storage finished loading, and persists the merge', async () => {
    let saved: ScreenDefinition[] | undefined;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const store = createScreenStore({
      storage: {
        load: async () => {
          await gate;
          return [{ id: 'new', title: 'old', version: 1 }, { id: 'kept', version: 4 }];
        },
        save: (screens) => void (saved = screens),
      },
    });
    store.put({ id: 'new', title: 'fresh' });
    expect(saved).toBeUndefined();
    release();
    await store.ready;
    expect(store.get('new')?.title).toBe('fresh');
    expect(saved?.map((s) => s.id).sort()).toEqual(['kept', 'new']);
  });

  it('resolves `ready` even when the storage fails', async () => {
    const store = createScreenStore({ storage: { load: () => Promise.reject(new Error('boom')), save: () => undefined } });
    await expect(store.ready).resolves.toBeUndefined();
    expect((store.loadError as Error).message).toBe('boom');
  });
});

describe('device lifecycle and acks', () => {
  it('does not announce itself after stopping', async () => {
    const bus = createMemoryBus();
    const seen: string[] = [];
    const spy = bus.connect();
    spy.subscribe((m) => seen.push(m.type));
    const device = createScreenDevice({ transport: bus.connect(), info: { id: 'd' }, heartbeatMs: 0 });
    await flush();
    seen.length = 0;
    device.setTheme({ base: 'light' });
    device.stop();
    await flush();
    expect(seen).toEqual(['device/bye']);
  });

  it('ignores acks from devices that were not targeted, and duplicates', async () => {
    const bus = createMemoryBus();
    const hub = createScreenHub({ transport: bus.connect(), ackTimeoutMs: 100 });
    const device = createScreenDevice({ transport: bus.connect(), info: { id: 'd' }, heartbeatMs: 0 });
    const forger = bus.connect();
    forger.subscribe((m) => {
      if (m.type === 'theme/set') {
        forger.send(createEnvelope('ack', 'intruder', { ref: m.id, ok: false, error: 'forged' }) as AnyEnvelope);
        forger.send(createEnvelope('ack', 'd', { ref: m.id, ok: false, error: 'dup' }) as AnyEnvelope);
      }
    });
    await flush();
    const result = await hub.setTheme('d', { base: 'light' });
    expect(result.acks).toEqual([{ deviceId: 'd', ok: true }]);
    expect(result.ok).toBe(true);
    hub.dispose();
    device.dispose();
  });
});

describe('relay identity', () => {
  const msg = (from: string, type: string, extra: object = {}) => JSON.stringify({ ms: 1, id: Math.random().toString(), from, type, ts: 0, payload: {}, ...extra });

  it('binds identity only after authorisation', () => {
    const relay = createRelay({ authorize: (m) => m.from !== 'd1' || (m.payload as { token?: string }).token === 'ok' });
    const inbox: string[] = [];
    const hub = relay.connect({ send: (d) => inbox.push(d) });
    const intruder = relay.connect({ send: () => undefined });
    intruder.receive(msg('d1', 'device/hello', { payload: { device: { id: 'd1', tags: ['hall'] } } }));
    expect(intruder.peerId).toBeUndefined();
    expect(intruder.tags).toEqual([]);
    intruder.close();
    expect(inbox.filter((d) => d.includes('device/bye'))).toEqual([]);
    void hub;
  });

  it('does not send a stale bye when a peer reconnected on a new socket', () => {
    const relay = createRelay();
    const inbox: string[] = [];
    relay.connect({ send: (d) => inbox.push(JSON.parse(d).type) });
    const old = relay.connect({ send: () => undefined });
    old.receive(msg('d1', 'device/hello'));
    const fresh = relay.connect({ send: () => undefined });
    fresh.receive(msg('d1', 'device/hello'));
    old.close();
    expect(inbox).toEqual(['device/hello', 'device/hello']);
    fresh.close();
    expect(inbox.at(-1)).toBe('device/bye');
  });
});

describe('websocket transport', () => {
  it('drops stale queued messages and survives a throwing constructor', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // no reconnect jitter
    const sent: string[] = [];
    let attempts = 0;
    class FakeSocket implements WebSocketLike {
      readyState = 0;
      onopen: ((e: unknown) => void) | null = null;
      onclose: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onmessage: ((e: { data: unknown }) => void) | null = null;
      constructor() {
        attempts++;
        if (attempts === 1) throw new Error('bad url');
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.({});
        }, 0);
      }
      send(data: string) {
        sent.push(JSON.parse(data).payload.name);
      }
      close() {}
    }
    const transport = webSocketTransport({ url: 'ws://x', WebSocket: FakeSocket, minDelayMs: 4000, maxQueueAgeMs: 2500 });
    transport.send(createEnvelope('custom', 'h', { name: 'stale' }) as AnyEnvelope); // t=0, sent ~4 s later: too old
    vi.advanceTimersByTime(2000);
    transport.send(createEnvelope('custom', 'h', { name: 'fresh' }) as AnyEnvelope); // t=2 s, 2 s old: kept
    await vi.advanceTimersByTimeAsync(2500);
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(sent).toEqual(['fresh']);
    transport.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
});
