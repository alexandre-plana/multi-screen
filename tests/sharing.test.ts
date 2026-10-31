import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryBus, createScreenDevice, createScreenHub, createScreenRouter, type ScreenDefinition, type ScreenDevice, type ScreenHub } from 'multi-screen';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const screen: ScreenDefinition = {
  id: 'lobby',
  route: '/lobby',
  panels: [{ id: 'title', component: 'ms:text', params: { text: 'Welcome' } }],
};

let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
});

function setup(devices = 2) {
  const bus = createMemoryBus();
  const hub: ScreenHub = createScreenHub({ transport: bus.connect(), id: 'hub', ackTimeoutMs: 200 });
  const list: ScreenDevice[] = [];
  for (let i = 0; i < devices; i++) {
    list.push(
      createScreenDevice({
        transport: bus.connect(),
        info: { id: `d${i}`, name: `Screen ${i}`, tags: i === 0 ? ['lobby'] : ['office'] },
        router: createScreenRouter(),
        heartbeatMs: 0,
      }),
    );
  }
  cleanups.push(() => hub.dispose(), ...list.map((d) => () => d.dispose()));
  return { hub, devices: list };
}

describe('hub ↔ devices', () => {
  it('discovers devices and their state', async () => {
    const { hub } = setup();
    await flush();
    expect(hub.devices().map((d) => d.info.id).sort()).toEqual(['d0', 'd1']);
    expect(hub.device('d0')).toMatchObject({ online: true, info: { name: 'Screen 0' }, state: { screens: [] } });
  });

  it('sends a screen to a device: stored, routed and shown', async () => {
    const { hub, devices } = setup();
    await flush();
    const result = await hub.show('d0', screen);
    expect(result).toMatchObject({ ok: true, expected: ['d0'], missing: [] });
    const [d0, d1] = devices as [ScreenDevice, ScreenDevice];
    expect(d0.store.get('lobby')?.version).toBe(1);
    expect(d0.router.adapter.location.pathname).toBe('/lobby');
    expect(d0.currentScreen?.id).toBe('lobby');
    expect(d1.store.has('lobby')).toBe(false);
    await flush();
    expect(hub.device('d0')?.state).toMatchObject({ screenId: 'lobby', path: '/lobby', screens: [{ id: 'lobby', version: 1, hash: expect.any(String) }] });
  });

  it('targets by tag and broadcasts', async () => {
    const { hub, devices } = setup();
    await flush();
    await hub.show('tag:office', screen, { navigate: false });
    expect(devices.map((d) => d.store.has('lobby'))).toEqual([false, true]);
    const all = await hub.setTheme('*', { base: 'light' });
    expect(all.acks.map((a) => a.deviceId).sort()).toEqual(['d0', 'd1']);
    expect(devices.every((d) => d.themeOverride?.base === 'light')).toBe(true);
  });

  it('updates a screen everywhere with a patch, keeping versions aligned', async () => {
    const { hub, devices } = setup();
    hub.store.put(screen);
    await flush();
    await hub.show('*', 'lobby');
    await flush();
    const [result] = await hub.update('lobby', { panels: [{ id: 'title', component: 'ms:text', params: { text: 'Bonjour' } }] });
    expect(result).toMatchObject({ ok: true });
    for (const device of devices) {
      expect(device.store.get('lobby')).toMatchObject({ version: 2, panels: [{ params: { text: 'Bonjour' } }] });
    }
  });

  it('sends the full screen to devices with an unexpected version', async () => {
    const { hub, devices } = setup(1);
    hub.store.put(screen);
    await flush();
    await hub.show('d0', 'lobby');
    devices[0]!.store.patch('lobby', { title: 'local edit' });
    await flush();
    await hub.update('lobby', { title: 'Hub title' });
    expect(devices[0]!.store.get('lobby')).toMatchObject({ title: 'Hub title', version: 2 });
  });

  it('sets display with or without merge and navigates', async () => {
    const { hub, devices } = setup(1);
    await flush();
    const d0 = devices[0]!;
    await hub.setDisplay('d0', { rotation: 90, locked: true });
    await hub.setDisplay('d0', { hideTabs: true }, { merge: true });
    expect(d0.displayOverride).toEqual({ rotation: 90, locked: true, hideTabs: true });
    expect(d0.displayFor({ id: 'x', display: { rotation: 0, scale: 2 } })).toEqual({ rotation: 90, scale: 2, locked: true, hideTabs: true });
    await hub.setDisplay('d0', null);
    expect(d0.displayOverride).toBeUndefined();
    await hub.navigate('d0', '/screens/anything');
    expect(d0.router.current?.screenId).toBe('anything');
  });

  it('reports invalid commands as failed acks', async () => {
    const { hub, devices } = setup(1);
    await flush();
    const errors: string[] = [];
    devices[0]!.subscribe((e) => e.type === 'error' && errors.push(e.error.message));
    const result = await hub.send('d0', 'screen/show', { screen: { id: '' } as ScreenDefinition });
    expect(result.ok).toBe(false);
    expect(result.acks[0]?.error).toMatch(/screen.id/);
    expect(errors).toHaveLength(1);
    expect((await hub.patch('d0', 'missing', { title: 'x' })).acks[0]?.error).toMatch(/Unknown screen/);
  });

  it('honours accept / deny hooks', async () => {
    const bus = createMemoryBus();
    const hub = createScreenHub({ transport: bus.connect(), id: 'intruder', ackTimeoutMs: 100 });
    const device = createScreenDevice({ transport: bus.connect(), info: { id: 'd' }, heartbeatMs: 0, accept: (m) => m.from === 'trusted', deny: ['route/navigate'] });
    cleanups.push(() => hub.dispose(), () => device.dispose());
    await flush();
    const result = await hub.show('d', screen);
    expect(result.acks[0]).toEqual({ deviceId: 'd', ok: false, error: 'refused' });
    expect(device.store.size).toBe(0);
  });

  it('forwards identify and custom commands', async () => {
    const { hub, devices } = setup(1);
    await flush();
    const seen: unknown[] = [];
    devices[0]!.subscribe((e) => (e.type === 'identify' || e.type === 'custom') && seen.push(e));
    await hub.identify('d0', 1500);
    await hub.command('d0', 'reload', { hard: true });
    expect(seen).toEqual([
      { type: 'identify', durationMs: 1500 },
      { type: 'custom', name: 'reload', data: { hard: true }, from: 'hub' },
    ]);
  });

  it('marks devices offline on bye and when they go silent', async () => {
    const bus = createMemoryBus();
    const hub = createScreenHub({ transport: bus.connect(), staleAfterMs: 30, ackTimeoutMs: 50 });
    const a = createScreenDevice({ transport: bus.connect(), info: { id: 'a' }, heartbeatMs: 0 });
    const b = createScreenDevice({ transport: bus.connect(), info: { id: 'b' }, heartbeatMs: 0 });
    cleanups.push(() => hub.dispose(), () => b.dispose());
    await flush();
    a.dispose();
    await flush();
    expect(hub.device('a')?.online).toBe(false);
    expect(hub.device('b')?.online).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(hub.device('b')?.online).toBe(false);
    // A silent device is not waited for.
    expect((await hub.identify('*')).expected).toEqual([]);
  });

  it('resolves immediately when nobody matches', async () => {
    const { hub } = setup(0);
    const started = Date.now();
    const result = await hub.show('ghost', screen);
    expect(result).toMatchObject({ expected: [], acks: [], ok: true });
    expect(Date.now() - started).toBeLessThan(100);
  });
});
