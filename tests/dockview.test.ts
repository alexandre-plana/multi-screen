// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMemoryBus, createScreenDevice, createScreenHub, createScreenRouter, createScreenStore, type ScreenDefinition } from 'multi-screen';
import { createPanelRegistry, createScreenOutlet, mountScreen, registerBuiltinPanels, registerTheme, resolveTheme, structureKey, type ScreenView } from 'multi-screen/dockview';

beforeAll(() => {
  // jsdom has no ResizeObserver; dockview and the view only need the constructor.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

let host: HTMLElement;
let views: { dispose(): void }[] = [];
afterEach(() => {
  for (const v of views) v.dispose();
  views = [];
  host?.remove();
});

function makeHost() {
  host = document.createElement('div');
  document.body.append(host);
  return host;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

const screen: ScreenDefinition = {
  id: 'ops',
  panels: [
    { id: 'a', component: 'counter', title: 'A', params: { value: 1 } },
    { id: 'b', component: 'counter', params: { value: 2 }, position: { referencePanel: 'a', direction: 'below' } },
  ],
};

function counterRegistry() {
  const created: string[] = [];
  const updates: unknown[] = [];
  const registry = createPanelRegistry().register<{ value?: number }>('counter', ({ element, id, params }) => {
    created.push(id);
    element.textContent = `${id}=${params.value}`;
    return {
      update(p) {
        updates.push(p);
        element.textContent = `${id}=${p.value}`;
      },
    };
  });
  return { registry, created, updates };
}

describe('ScreenView', () => {
  it('builds a screen from declarative panels', () => {
    const { registry, created } = counterRegistry();
    const view = mountScreen(makeHost(), { registry, screen });
    views.push(view);
    expect(view.api.panels.map((p) => p.id)).toEqual(['a', 'b']);
    expect(view.api.groups).toHaveLength(2);
    expect(created).toEqual(['a', 'b']);
    expect(host.textContent).toContain('a=1');
    expect(view.api.getPanel('b')?.title).toBe('b');
  });

  it('updates params and titles in place, without re-creating panels', () => {
    const { registry, created, updates } = counterRegistry();
    const view = mountScreen(makeHost(), { registry, screen });
    views.push(view);
    view.render({ ...screen, panels: [{ ...screen.panels![0]!, title: 'Alpha', params: { value: 10 } }, screen.panels![1]!] });
    expect(created).toEqual(['a', 'b']);
    expect(updates).toEqual([expect.objectContaining({ value: 10 })]);
    expect(view.api.getPanel('a')?.title).toBe('Alpha');
    expect(host.textContent).toContain('a=10');
  });

  it('rebuilds when the structure changes', () => {
    const { registry, created } = counterRegistry();
    const view = mountScreen(makeHost(), { registry, screen });
    views.push(view);
    view.render({ ...screen, panels: [...screen.panels!, { id: 'c', component: 'counter' }] });
    expect(created).toEqual(['a', 'b', 'a', 'b', 'c']);
    expect(view.api.panels).toHaveLength(3);
  });

  it('restores a serialized layout and captures it back', () => {
    const { registry } = counterRegistry();
    const first = mountScreen(makeHost(), { registry, screen });
    views.push(first);
    const captured = first.toScreen()!;
    expect(captured.layout?.panels.a?.params).toEqual({ value: 1 });
    expect(captured.panels).toBeUndefined();
    const second = mountScreen(makeHost(), { registry, screen: captured });
    views.push(second);
    expect(second.api.panels.map((p) => p.id).sort()).toEqual(['a', 'b']);
    // Params-only change of a layout screen is still incremental.
    expect(structureKey(captured)).toBe(structureKey({ ...captured, layout: { ...captured.layout!, panels: { ...captured.layout!.panels, a: { ...captured.layout!.panels.a!, params: { value: 5 } } } } }));
  });

  it('renders an explicit fallback for unknown components', () => {
    const view = mountScreen(makeHost(), { registry: createPanelRegistry(), screen: { id: 's', panels: [{ id: 'x', component: 'nope' }] } });
    views.push(view);
    expect(host.querySelector('.ms-missing')?.textContent).toContain('"nope"');
  });

  it('applies theme base, variables and class, with overrides', () => {
    registerTheme('brand', { ...resolveTheme({ base: 'light' }), name: 'brand', className: 'brand-theme' });
    const view = mountScreen(makeHost(), {
      registry: createPanelRegistry(),
      screen: { id: 's', theme: { base: 'brand', variables: { '--dv-background-color': 'red' }, className: 'x y' } },
    });
    views.push(view);
    expect(view.root.style.getPropertyValue('--dv-background-color')).toBe('red');
    expect(view.root.classList.contains('x')).toBe(true);
    expect(host.querySelector('.brand-theme')).not.toBeNull();
    view.setTheme({ base: 'dark', variables: { '--other': '1' } });
    expect(view.root.dataset.theme).toBe('dark');
    expect(view.root.style.getPropertyValue('--dv-background-color')).toBe('red');
    view.render({ id: 's' });
    expect(view.root.style.getPropertyValue('--dv-background-color')).toBe('');
    expect(view.root.classList.contains('x')).toBe(false);
  });

  it('applies display: classes, lock, stage geometry, fullscreen errors', async () => {
    const onDisplayError = vi.fn();
    const view: ScreenView = mountScreen(makeHost(), { registry: createPanelRegistry(), onDisplayError });
    views.push(view);
    expect(host.querySelector('.ms-empty')).not.toBeNull();
    view.render({ id: 's', display: { hideTabs: true, cursor: 'none', locked: true, background: 'black', resolution: { width: 1920, height: 1080 } } });
    expect(host.querySelector('.ms-empty')).toBeNull();
    expect(view.root.classList.contains('ms-hide-tabs')).toBe(true);
    expect(view.root.classList.contains('ms-no-cursor')).toBe(true);
    expect(view.stage.style.width).toBe('1920px');
    view.setDisplay({ fullscreen: true });
    await flush();
    expect(view.display).toMatchObject({ fullscreen: true, locked: true });
    expect(onDisplayError).toHaveBeenCalledWith('fullscreen', expect.anything());
  });

  it('reports user layout changes', async () => {
    const { registry } = counterRegistry();
    const onLayoutChange = vi.fn();
    const view = mountScreen(makeHost(), { registry, screen, onLayoutChange });
    views.push(view);
    expect(onLayoutChange).not.toHaveBeenCalled();
    view.api.getPanel('b')!.api.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(onLayoutChange).toHaveBeenCalled();
    expect(Object.keys(onLayoutChange.mock.lastCall![0].panels)).toEqual(['a']);
  });
});

describe('outlet', () => {
  it('follows the router and the store, live', () => {
    const { registry } = counterRegistry();
    const store = createScreenStore({ screens: [screen, { id: 'other', panels: [{ id: 'z', component: 'counter', params: { value: 9 } }] }] });
    const router = createScreenRouter();
    const notFound = vi.fn((el: HTMLElement) => (el.textContent = 'missing'));
    const outlet = createScreenOutlet(makeHost(), { registry, store, router, notFound });
    views.push(outlet);
    expect(outlet.view.screen).toBeUndefined();
    router.navigateToScreen('ops');
    expect(outlet.view.api.panels).toHaveLength(2);
    store.patch('ops', { panels: [{ ...screen.panels![0]!, params: { value: 3 } }, screen.panels![1]!] });
    expect(host.textContent).toContain('a=3');
    router.addRoute({ path: '/tv', screenId: 'other' });
    router.navigate('/tv');
    expect(outlet.view.api.panels.map((p) => p.id)).toEqual(['z']);
    router.navigate('/screens/ghost');
    expect(notFound).toHaveBeenCalled();
    expect(host.textContent).toContain('missing');
  });

  it('renders what a hub sends to a device, with its overrides', async () => {
    const bus = createMemoryBus();
    const device = createScreenDevice({ transport: bus.connect(), info: { id: 'wall', name: 'Wall 1' }, router: createScreenRouter(), heartbeatMs: 0 });
    const hub = createScreenHub({ transport: bus.connect(), ackTimeoutMs: 200 });
    const registry = registerBuiltinPanels(createPanelRegistry());
    const outlet = createScreenOutlet(makeHost(), { registry, router: device.router, device });
    views.push(outlet, device, hub);
    await flush();
    await hub.show('wall', { id: 'hello', panels: [{ id: 't', component: 'ms:text', params: { text: 'Bonjour' } }] });
    expect(host.textContent).toContain('Bonjour');
    hub.store.put({ id: 'hello', panels: [{ id: 't', component: 'ms:text', params: { text: 'Bonjour' } }] });
    await flush();
    await hub.update('hello', { panels: [{ id: 't', component: 'ms:text', params: { text: 'Salut' } }] });
    expect(host.textContent).toContain('Salut');
    await hub.setTheme('wall', { base: 'light' });
    await flush();
    expect(outlet.view.root.dataset.theme).toBe('light');
    await hub.setDisplay('wall', { hideTabs: true });
    await flush();
    expect(outlet.view.root.classList.contains('ms-hide-tabs')).toBe(true);
    await hub.identify('wall', 50);
    expect(host.querySelector('.ms-identify')?.textContent).toBe('Wall 1');
  });
});
