// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { createScreenRouter, createScreenStore } from 'multi-screen';
import { createPanelRegistry, elementPanel, mountScreen } from 'multi-screen/dockview';
import { ScreenOutletView, reactPanel, useRouteMatch, useScreens, type PanelProps } from 'multi-screen/react';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

let cleanup: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanup) c();
  cleanup = [];
  document.body.replaceChildren();
});

const host = () => document.body.appendChild(document.createElement('div'));

describe('reactPanel', () => {
  it('renders and re-renders a React component inside a panel', async () => {
    const Greeting = ({ id, params }: PanelProps<{ name?: string }>) => createElement('p', null, `${id}: hello ${params.name}`);
    const registry = createPanelRegistry({ greeting: reactPanel(Greeting) });
    const el = host();
    let view!: ReturnType<typeof mountScreen>;
    await act(async () => {
      view = mountScreen(el, { registry, screen: { id: 's', panels: [{ id: 'g', component: 'greeting', params: { name: 'Ada' } }] } });
    });
    cleanup.push(() => view.dispose());
    expect(el.textContent).toContain('g: hello Ada');
    await act(async () => view.render({ id: 's', panels: [{ id: 'g', component: 'greeting', params: { name: 'Grace' } }] }));
    expect(el.textContent).toContain('g: hello Grace');
  });
});

describe('React outlet and hooks', () => {
  it('renders the routed screen and exposes live hooks', async () => {
    const store = createScreenStore({ screens: [{ id: 'a', title: 'A', panels: [{ id: 'p', component: 'label', params: { text: 'Écran A' } }] }] });
    const router = createScreenRouter({ screenRoutePrefix: '/s' });
    const registry = createPanelRegistry().register<{ text?: string }>('label', ({ element, params }) => {
      element.textContent = params.text ?? '';
      return { update: (p) => (element.textContent = p.text ?? '') };
    });
    const seen: string[] = [];
    function App() {
      const screens = useScreens(store);
      const match = useRouteMatch(router);
      seen.push(`${screens.length}:${match?.screenId ?? '-'}`);
      return createElement(ScreenOutletView, { router, store, registry, style: { height: 300 } });
    }
    const el = host();
    const root = createRoot(el);
    await act(async () => root.render(createElement(App)));
    cleanup.push(() => root.unmount());
    await act(async () => router.navigate('/s/a'));
    expect(el.textContent).toContain('Écran A');
    await act(async () => void store.put({ id: 'b' }));
    expect(seen.at(-1)).toBe('2:a');
  });
});

describe('elementPanel', () => {
  it('assigns params as properties of a custom element', () => {
    class Badge extends HTMLElement {
      label = '';
    }
    customElements.define('ms-test-badge', Badge);
    const registry = createPanelRegistry({ badge: elementPanel('ms-test-badge', { attributes: true }) });
    const el = host();
    const view = mountScreen(el, { registry, screen: { id: 's', panels: [{ id: 'b', component: 'badge', params: { label: 'Hi', extra: 1 } }] } });
    cleanup.push(() => view.dispose());
    const badge = el.querySelector('ms-test-badge') as Badge & { extra?: number };
    expect(badge.label).toBe('Hi');
    expect(badge.getAttribute('label')).toBe('Hi');
    view.render({ id: 's', panels: [{ id: 'b', component: 'badge', params: { label: 'Yo' } }] });
    expect(badge.label).toBe('Yo');
    expect(badge.extra).toBeUndefined();
  });
});
