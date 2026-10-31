// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMemoryBus, createScreenDevice, createScreenHub, createScreenRouter, createScreenStore, type ScreenDefinition } from 'multi-screen';
import { createPanelRegistry, createScreenManager, managerLabelsFr, registerBuiltinPanels, type ScreenManager } from 'multi-screen/dockview';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const flush = () => new Promise((r) => setTimeout(r, 0));
let cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
  document.body.replaceChildren();
});

const screens: ScreenDefinition[] = [
  { id: 'accueil', title: 'Accueil', route: '/accueil', theme: { base: 'abyss' }, panels: [{ id: 't', component: 'ms:text', params: { text: 'Bienvenue' } }] },
  { id: 'ventes', title: 'Ventes', route: '/ventes', panels: [{ id: 'a', component: 'ms:clock' }, { id: 'b', component: 'ms:color' }] },
  { id: 'mur', title: 'Mur', panels: [] },
];

function setup(withHub = false) {
  const host = document.body.appendChild(document.createElement('div'));
  const store = createScreenStore({ screens, now: (() => { let t = 0; return () => new Date(Date.UTC(2026, 9, 31, 10, t++)); })() });
  const registry = registerBuiltinPanels(createPanelRegistry());
  const onEdit = vi.fn();
  let hub, device;
  if (withHub) {
    const bus = createMemoryBus();
    hub = createScreenHub({ transport: bus.connect(), store, ackTimeoutMs: 200 });
    device = createScreenDevice({ transport: bus.connect(), info: { id: 'tv', name: 'TV Hall' }, router: createScreenRouter(), heartbeatMs: 0 });
    cleanups.push(() => hub!.dispose(), () => device!.dispose());
  }
  const manager: ScreenManager = createScreenManager(host, { store, registry, hub, onEdit, labels: managerLabelsFr, shareBaseUrl: 'https://ecrans.example/device.html', locale: 'fr-FR' });
  cleanups.push(() => manager.dispose());
  const titles = () => [...host.querySelectorAll('.msm-card:not([hidden]) .msm-title')].map((e) => e.textContent);
  const card = (id: string) => host.querySelector<HTMLElement>(`.msm-card[data-screen-id="${id}"]`)!;
  return { host, store, manager, onEdit, hub: hub as ReturnType<typeof createScreenHub> | undefined, device: device as ReturnType<typeof createScreenDevice> | undefined, titles, card };
}

describe('screen manager', () => {
  it('lists every screen with its thumbnail and details', () => {
    const { host, card } = setup();
    expect(host.querySelector('.msm-count')?.textContent).toBe('3');
    expect(card('accueil').querySelector('.msm-route')?.textContent).toBe('/accueil');
    expect(card('accueil').querySelector('.msm-meta')?.textContent).toMatch(/^v1 · 1 panneau · abyss · /);
    expect(card('ventes').querySelector('.msm-meta')?.textContent).toContain('2 panneaux');
    expect(card('mur').querySelector('.msm-route')?.textContent).toBe('#mur');
    expect(card('accueil').querySelector('.msm-thumb')?.textContent).toContain('Bienvenue');
  });

  it('searches and sorts', () => {
    const { host, titles } = setup();
    expect(titles()).toEqual(['Mur', 'Ventes', 'Accueil']); // last modified first
    const sort = host.querySelector<HTMLSelectElement>('.msm-sort')!;
    sort.value = 'title';
    sort.dispatchEvent(new Event('change'));
    expect(titles()).toEqual(['Accueil', 'Mur', 'Ventes']);
    const search = host.querySelector<HTMLInputElement>('.msm-search')!;
    search.value = '/vent';
    search.dispatchEvent(new Event('input'));
    expect(titles()).toEqual(['Ventes']);
    search.value = 'zzz';
    search.dispatchEvent(new Event('input'));
    expect(host.querySelector('.msm-empty')?.textContent).toBe('Aucun écran ne correspond à la recherche.');
  });

  it('opens the editor and creates screens through onEdit', () => {
    const { host, store, onEdit, card } = setup();
    card('ventes').querySelector<HTMLButtonElement>('.msm-actions .msm-primary')!.click();
    expect(onEdit).toHaveBeenLastCalledWith('ventes');
    host.querySelector<HTMLButtonElement>('.msm-toolbar .msm-primary')!.click();
    expect(onEdit).toHaveBeenLastCalledWith('screen');
    expect(store.get('screen')?.title).toBe('Écran sans titre');
  });

  it('reflects live updates of the store', () => {
    const { store, card } = setup();
    store.patch('accueil', { title: 'Hall', panels: [{ id: 't', component: 'ms:text', params: { text: 'Mis à jour' } }] });
    expect(card('accueil').querySelector('.msm-title')?.textContent).toBe('Hall');
    expect(card('accueil').querySelector('.msm-thumb')?.textContent).toContain('Mis à jour');
    store.remove('mur');
    expect(card('mur')).toBeNull();
  });

  it('duplicates, exports and imports without overwriting', () => {
    const { store, manager, card } = setup();
    card('accueil').querySelectorAll<HTMLButtonElement>('.msm-link')[0]!.click();
    expect(store.get('accueil-copy')).toMatchObject({ title: 'Accueil (2)', version: 1 });
    const exported = JSON.parse(manager.exportJson(['accueil']));
    expect(exported).toHaveLength(1);
    const result = manager.importJson(JSON.stringify([exported[0], { id: 'neuf', title: 'Neuf' }, { id: '' }]));
    expect(result).toEqual({ imported: ['accueil-import', 'neuf'], failed: 1 });
    expect(store.get('accueil')?.version).toBe(1);
    expect(manager.importJson('pas du json')).toEqual({ imported: [], failed: 1 });
  });

  it('deletes after confirmation, alone or in bulk', () => {
    const { host, store, card } = setup();
    const del = [...card('mur').querySelectorAll<HTMLButtonElement>('.msm-link')].at(-1)!;
    del.click();
    expect(store.has('mur')).toBe(true);
    expect(del.textContent).toBe('Confirmer ?');
    del.click();
    expect(store.has('mur')).toBe(false);
    card('accueil').querySelector<HTMLInputElement>('.msm-select')!.click();
    card('ventes').querySelector<HTMLInputElement>('.msm-select')!.click();
    expect(host.querySelector('.msm-bulk')?.textContent).toContain('2 sélectionnés');
    const bulkDelete = host.querySelector<HTMLButtonElement>('.msm-bulk .msm-danger')!;
    bulkDelete.click();
    bulkDelete.click();
    expect(store.size).toBe(0);
    expect(host.querySelector('.msm-empty')?.textContent).toContain('Aucun écran');
  });

  it('shows which devices display a screen, sends it, and removes it from devices on delete', async () => {
    const { store, hub, device, card } = setup(true);
    await flush();
    expect(card('ventes').querySelector('.msm-devices')?.textContent).toBe('Affiché sur aucun appareil');
    const menu = card('ventes').querySelector<HTMLDetailsElement>('.msm-actions details')!;
    menu.open = true;
    menu.dispatchEvent(new Event('toggle'));
    expect(menu.textContent).toContain('TV Hall');
    menu.querySelector<HTMLButtonElement>('.msm-menu-panel .msm-primary')!.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(device!.currentScreen?.id).toBe('ventes');
    expect(card('ventes').querySelector('.msm-devices')?.textContent).toBe('Affiché sur TV Hall');
    expect(hub!.device('tv')?.state.screenId).toBe('ventes');
    const del = [...card('ventes').querySelectorAll<HTMLButtonElement>('.msm-link')].at(-1)!;
    del.click();
    del.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(store.has('ventes')).toBe(false);
    expect(device!.store.has('ventes')).toBe(false);
  });
});
