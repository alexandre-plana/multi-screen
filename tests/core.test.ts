import { describe, expect, it, vi } from 'vitest';
import {
  ValidationError, applyMergePatch, computeStage, createMergePatch, createScreenStore, decodeScreen, encodeScreen,
  mergeDisplay, mergeTheme, validateScreen, type ScreenDefinition, type ScreenStorage,
} from 'multi-screen';

const lobby: ScreenDefinition = {
  id: 'lobby',
  title: 'Lobby',
  route: '/lobby',
  panels: [
    { id: 'clock', component: 'ms:clock' },
    { id: 'news', component: 'ms:text', params: { text: 'Hello' }, position: { referencePanel: 'clock', direction: 'below' } },
  ],
  theme: { base: 'abyss' },
};

describe('merge patch', () => {
  it('merges objects, replaces arrays, deletes with null', () => {
    expect(applyMergePatch({ a: 1, b: { c: 2, d: 3 }, e: [1] }, { b: { c: null, x: 1 }, e: [2], f: 'y' })).toEqual({ a: 1, b: { d: 3, x: 1 }, e: [2], f: 'y' });
  });

  it('round-trips with createMergePatch', () => {
    const from = { a: 1, b: { c: 2 }, z: true };
    const to = { a: 2, b: { c: 2, d: [1, 2] } };
    expect(applyMergePatch(from, createMergePatch(from, to))).toEqual(to);
  });

  it('ignores prototype pollution keys', () => {
    const result = applyMergePatch({}, JSON.parse('{"__proto__":{"polluted":true}}'));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(result as object)).toEqual([]);
  });
});

describe('validateScreen', () => {
  it('accepts a valid screen', () => {
    expect(validateScreen(lobby)).toBe(lobby);
  });

  it.each([
    [{ id: '' }, 'screen.id'],
    [{ id: 'a', route: 'lobby' }, 'screen.route'],
    [{ id: 'a', panels: [{ id: 'p', component: 'x' }, { id: 'p', component: 'y' }] }, 'screen.panels[1].id'],
    [{ id: 'a', panels: [{ id: 'p', component: 'x', position: { direction: 'up' } }] }, 'screen.panels[0].position.direction'],
    [{ id: 'a', theme: { variables: { color: 'red' } } }, 'screen.theme.variables.color'],
    [{ id: 'a', display: { rotation: 45 } }, 'screen.display.rotation'],
    [{ id: 'a', display: { resolution: { width: 10 } } }, 'screen.display.resolution'],
  ])('rejects %j at %s', (input, path) => {
    try {
      validateScreen(input);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).path).toBe(path);
    }
  });
});

describe('ScreenStore', () => {
  it('versions and stamps screens, and skips no-op writes', () => {
    let t = 0;
    const store = createScreenStore({ now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)) });
    const events: string[] = [];
    store.subscribe((e) => events.push(e.type));
    expect(store.put(lobby).version).toBe(1);
    expect(store.put(lobby).version).toBe(1);
    const patched = store.patch('lobby', { title: 'Hall' });
    expect(patched).toMatchObject({ version: 2, title: 'Hall', updatedAt: '2026-01-01T00:00:01.000Z' });
    expect(events).toEqual(['put', 'put']);
    expect(store.remove('lobby')).toBe(true);
    expect(store.has('lobby')).toBe(false);
  });

  it('returns copies that cannot mutate the store', () => {
    const store = createScreenStore({ screens: [lobby] });
    const copy = store.get('lobby')!;
    copy.title = 'mutated';
    expect(store.get('lobby')!.title).toBe('Lobby');
  });

  it('keeps an incoming version when mirroring', () => {
    const store = createScreenStore();
    expect(store.put({ ...lobby, version: 7 }, { version: 'keep' }).version).toBe(7);
  });

  it('loads from and saves to a storage, skipping corrupted entries', async () => {
    let saved: ScreenDefinition[] = [];
    const storage: ScreenStorage = {
      load: async () => [lobby, { id: '' } as ScreenDefinition],
      save: (screens) => {
        saved = screens;
      },
    };
    const store = createScreenStore({ storage });
    await store.ready;
    expect(store.list().map((s) => s.id)).toEqual(['lobby']);
    store.put({ id: 'other' });
    await Promise.resolve();
    expect(saved.map((s) => s.id)).toEqual(['lobby', 'other']);
  });
});

describe('display', () => {
  it('merges layers field by field', () => {
    expect(mergeDisplay({ scale: 2, locked: true }, undefined, { scale: 1 })).toEqual({ scale: 1, locked: true });
    expect(mergeTheme({ base: 'dark', variables: { '--a': '1' } }, { variables: { '--b': '2' } })).toEqual({ base: 'dark', variables: { '--a': '1', '--b': '2' } });
  });

  it('fills the viewport by default', () => {
    expect(computeStage({ width: 800, height: 600 }, {})).toMatchObject({ width: 800, height: 600, scaleX: 1, transform: 'translate(0px, 0px)' });
  });

  it('fits a virtual resolution, letterboxed', () => {
    const stage = computeStage({ width: 1000, height: 1000 }, { resolution: { width: 1920, height: 1080 } });
    expect(stage.width).toBe(1920);
    expect(stage.scaleX).toBeCloseTo(1000 / 1920);
    expect(stage.transform).toMatch(/^translate\(0px, 218\.75px\) scale/);
  });

  it('rotates a portrait totem', () => {
    const stage = computeStage({ width: 1920, height: 1080 }, { rotation: 90 });
    expect([stage.width, stage.height]).toEqual([1080, 1920]);
    expect(stage.transform).toContain('rotate(90deg)');
  });

  it('applies a manual zoom', () => {
    const stage = computeStage({ width: 1000, height: 500 }, { scale: 2 });
    expect([stage.width, stage.height, stage.scaleX]).toEqual([500, 250, 2]);
  });
});

describe('share links', () => {
  it('round-trips a screen, compressed or not', async () => {
    for (const compress of [true, false]) {
      const encoded = await encodeScreen({ ...lobby, version: 3, updatedAt: 'x' }, { compress });
      expect(encoded).toMatch(/^[jz]\.[A-Za-z0-9_-]+$/);
      const decoded = await decodeScreen(encoded);
      expect(decoded).toEqual(lobby);
    }
  });

  it('rejects garbage', async () => {
    await expect(decodeScreen('j.!!!')).rejects.toBeInstanceOf(ValidationError);
    await expect(decodeScreen('x.abc')).rejects.toBeInstanceOf(ValidationError);
    await expect(decodeScreen(`j.${btoa('{"id":""}')}`)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('external storage changes', () => {
  it('merges snapshots pushed by the storage without saving them back', () => {
    let push!: (screens: ScreenDefinition[]) => void;
    const save = vi.fn();
    const store = createScreenStore({ screens: [lobby, { id: 'gone' }], storage: { load: () => undefined, save, subscribe: (l) => ((push = l), () => undefined) } });
    const events: string[] = [];
    store.subscribe((e) => events.push(`${e.type}:${'screen' in e ? e.screen.id : ''}`));
    push([{ ...lobby, title: 'Other tab', version: 5 }, { id: 'new', version: 1 }]);
    expect(store.get('lobby')).toMatchObject({ title: 'Other tab', version: 5 });
    expect(store.has('gone')).toBe(false);
    expect(events).toEqual(['put:lobby', 'put:new', 'remove:gone']);
    expect(save).not.toHaveBeenCalled();
  });
});
