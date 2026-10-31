import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEnvelope, createMemoryBus, createPlaylist, createScreenDevice, createScreenHub, createScreenRouter, signedTransport, type AnyEnvelope } from 'multi-screen';

afterEach(() => {
  vi.useRealTimers();
});

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('signedTransport', () => {
  it('lets peers sharing the secret talk, and drops the others', async () => {
    const bus = createMemoryBus();
    const rejected: string[] = [];
    const hub = createScreenHub({ transport: signedTransport(bus.connect(), { secret: 's3cret' }), ackTimeoutMs: 300 });
    const device = createScreenDevice({
      transport: signedTransport(bus.connect(), { secret: 's3cret', onReject: (reason) => rejected.push(reason) }),
      info: { id: 'tv' },
      router: createScreenRouter(),
      heartbeatMs: 0,
    });
    const intruder = bus.connect();
    await settle();
    expect(hub.device('tv')).toBeDefined();
    expect((await hub.show('tv', { id: 'a' })).ok).toBe(true);

    // Unsigned, forged and replayed messages are all refused.
    intruder.send(createEnvelope('screen/remove', 'evil', { screenId: 'a' }, 'tv') as AnyEnvelope);
    intruder.send({ ...createEnvelope('screen/remove', 'evil', { screenId: 'a' }, 'tv'), sig: '00'.repeat(32) } as unknown as AnyEnvelope);
    const captured: AnyEnvelope[] = [];
    const spy = bus.connect();
    spy.subscribe((m) => m.type === 'theme/set' && captured.push(m));
    await hub.setTheme('tv', { base: 'light' });
    device.setTheme(null);
    spy.send(captured[0]!);
    await settle();
    expect(device.store.has('a')).toBe(true);
    expect(device.themeOverride).toBeUndefined();
    expect(rejected).toEqual(['unsigned', 'bad-signature', 'replayed']);
    hub.dispose();
    device.dispose();
  });

  it('refuses stale messages', async () => {
    const bus = createMemoryBus();
    const reasons: string[] = [];
    const a = signedTransport(bus.connect(), { secret: 'k' });
    const b = signedTransport(bus.connect(), { secret: 'k', maxSkewMs: 1000, onReject: (r) => reasons.push(r) });
    const received = vi.fn();
    b.subscribe(received);
    a.send({ ...createEnvelope('custom', 'x', { name: 'old' }), ts: Date.now() - 5000 } as AnyEnvelope);
    await settle();
    expect(received).not.toHaveBeenCalled();
    expect(reasons).toEqual(['expired']);
  });
});

describe('Playlist', () => {
  it('rotates screens through the router, loops, pauses and jumps', () => {
    vi.useFakeTimers();
    const router = createScreenRouter();
    router.addRoute({ path: '/promo/:n', screenId: 'promo' });
    const playlist = createPlaylist({
      router,
      items: [
        { screenId: 'news', durationMs: 1000 },
        { screenId: 'promo', durationMs: 500, params: { n: '2' } },
        { screenId: 'ignored', durationMs: 0 },
      ],
    });
    expect(router.current?.screenId).toBe('news');
    vi.advanceTimersByTime(1000);
    expect(router.adapter.location.pathname).toBe('/promo/2');
    vi.advanceTimersByTime(500);
    expect(router.current?.screenId).toBe('news');
    playlist.pause();
    vi.advanceTimersByTime(5000);
    expect(router.current?.screenId).toBe('news');
    playlist.previous();
    expect(router.current?.screenId).toBe('promo');
    playlist.dispose();
  });

  it('stops at the end without loop', () => {
    vi.useFakeTimers();
    const router = createScreenRouter();
    const events: string[] = [];
    const playlist = createPlaylist({ router, loop: false, items: [{ screenId: 'a', durationMs: 10 }] });
    playlist.subscribe((e) => events.push(e.type));
    vi.advanceTimersByTime(10);
    expect(events).toEqual(['state', 'end']);
    expect(playlist.playing).toBe(false);
  });
});
