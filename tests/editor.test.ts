// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createScreenStore } from 'multi-screen';
import { builtinPanelLabelsFr, createPanelRegistry, createScreenEditor, editorLabelsFr, registerBuiltinPanels, type ScreenEditor } from 'multi-screen/dockview';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

let editor: ScreenEditor | undefined;
afterEach(() => {
  editor?.dispose();
  editor = undefined;
  document.body.replaceChildren();
});

const tick = () => new Promise((r) => setTimeout(r, 10));

function setup(screens = [{ id: 'lobby', title: 'Lobby', panels: [{ id: 'hello', component: 'ms:text', params: { text: 'Hi' } }] }]) {
  const host = document.body.appendChild(document.createElement('div'));
  const store = createScreenStore({ screens });
  const registry = registerBuiltinPanels(createPanelRegistry(), { labels: builtinPanelLabelsFr });
  const onSave = vi.fn();
  editor = createScreenEditor(host, { registry, store, labels: editorLabelsFr, onSave });
  return { host, store, editor, onSave };
}

describe('screen editor', () => {
  it('lists screens and a palette of the registered panels', () => {
    const { host } = setup();
    expect([...host.querySelectorAll('.mse-item')].map((b) => b.textContent)).toEqual(['Lobby']);
    expect([...host.querySelectorAll('.mse-chip-label')].map((b) => b.textContent)).toEqual(['Texte', 'Image', 'Page web', 'Horloge', 'Couleur unie']);
    expect(host.querySelector('.mse-title')).toHaveProperty('value', 'Lobby');
    expect(host.textContent).toContain('Hi');
  });

  it('creates a screen, composes it from the palette and saves it as a dockview layout', () => {
    const { host, store, editor, onSave } = setup();
    const created = editor.create();
    expect(created.id).toBe('screen-2');
    expect(editor.screenId).toBe('screen-2');
    expect(host.querySelector('.mse-empty')).toHaveProperty('hidden', false);
    (host.querySelector('[data-component="ms:clock"]') as HTMLButtonElement).click();
    editor.addPanel('ms:color', { direction: 'below' });
    expect(editor.view.api.panels.map((p) => p.id)).toEqual(['ms-clock-1', 'ms-color-2']);
    expect(editor.view.api.groups).toHaveLength(2);
    expect(editor.dirty).toBe(true);
    const title = host.querySelector('.mse-title') as HTMLInputElement;
    title.value = 'Hall';
    title.dispatchEvent(new Event('input'));
    const saved = editor.save()!;
    expect(onSave).toHaveBeenCalledWith(saved);
    expect(saved).toMatchObject({ id: 'screen-2', title: 'Hall', version: 2 });
    expect(saved.panels).toBeUndefined();
    expect(Object.keys(saved.layout!.panels)).toEqual(['ms-clock-1', 'ms-color-2']);
    expect(saved.layout!.panels['ms-color-2']?.params).toEqual({ color: '#336699' });
    expect(store.get('screen-2')?.title).toBe('Hall');
    expect(editor.dirty).toBe(false);
  });

  it('edits the selected panel through generated fields and JSON', () => {
    const { host, store, editor } = setup();
    editor.view.api.getPanel('hello')!.api.setActive();
    const text = [...host.querySelectorAll('.mse-inspector .mse-field')].find((f) => f.querySelector('label')?.textContent === 'text')!.querySelector('textarea')!;
    expect(text.value).toBe('Hi');
    text.value = 'Bonjour';
    text.dispatchEvent(new Event('change'));
    expect(host.textContent).toContain('Bonjour');
    const json = host.querySelector('.mse-json') as HTMLTextAreaElement;
    json.value = '{"text":"Salut","size":"4em"}';
    (host.querySelector('.mse-details .mse-btn') as HTMLButtonElement).click();
    editor.save();
    expect(store.get('lobby')!.layout!.panels.hello?.params).toMatchObject({ text: 'Salut', size: '4em' });
    // The inspector is rebuilt after a valid apply.
    const json2 = host.querySelector('.mse-json') as HTMLTextAreaElement;
    json2.value = 'nope';
    (host.querySelector('.mse-details .mse-btn') as HTMLButtonElement).click();
    expect(host.querySelector('.mse-details .mse-error')?.textContent).toBe('JSON invalide');
  });

  it('edits screen settings without applying device-only display in the canvas', () => {
    const { host, store, editor } = setup();
    const inspector = host.querySelector('.mse-inspector')!;
    const route = [...inspector.querySelectorAll('input')].find((i) => i.placeholder.includes('/accueil'))!;
    route.value = 'hall';
    route.dispatchEvent(new Event('change'));
    expect(inspector.textContent).toContain('Une route commence par /');
    route.value = '/hall/:zone';
    route.dispatchEvent(new Event('change'));
    const theme = inspector.querySelector('select')!;
    theme.value = 'light';
    theme.dispatchEvent(new Event('change'));
    expect(editor.view.root.dataset.theme).toBe('light');
    const locked = [...inspector.querySelectorAll('.mse-check')].find((l) => l.textContent?.includes('Verrouiller'))!.querySelector('input')!;
    locked.checked = true;
    locked.dispatchEvent(new Event('change'));
    expect(editor.view.display.locked).toBe(false);
    editor.save();
    expect(store.get('lobby')).toMatchObject({ route: '/hall/:zone', theme: { base: 'light' }, display: { locked: true } });
  });

  it('removes panels, duplicates and deletes screens (with confirmation)', async () => {
    const { host, store, editor } = setup();
    editor.view.api.getPanel('hello')!.api.setActive();
    const remove = [...host.querySelectorAll('.mse-inspector .mse-btn')].find((b) => b.textContent === 'Retirer le panneau') as HTMLButtonElement;
    remove.click();
    expect(editor.view.api.panels).toHaveLength(0);
    editor.save();
    const dup = [...host.querySelectorAll('.mse-toolbar .mse-btn')].find((b) => b.textContent === 'Dupliquer') as HTMLButtonElement;
    dup.click();
    expect(editor.screenId).toBe('lobby-copy');
    expect(store.get('lobby-copy')?.title).toBe('Lobby (2)');
    const del = [...host.querySelectorAll('.mse-toolbar .mse-btn')].find((b) => b.textContent === 'Supprimer') as HTMLButtonElement;
    del.click();
    expect(store.has('lobby-copy')).toBe(true);
    expect(del.textContent).toBe('Confirmer la suppression ?');
    del.click();
    expect(store.has('lobby-copy')).toBe(false);
    expect(editor.screenId).toBe('lobby');
    await tick();
  });

  it('reloads a screen changed elsewhere unless there are unsaved edits', async () => {
    const { host, store, editor } = setup();
    store.patch('lobby', { title: 'From another tab' });
    expect((host.querySelector('.mse-title') as HTMLInputElement).value).toBe('From another tab');
    editor.addPanel('ms:text');
    store.patch('lobby', { title: 'Again' });
    expect((host.querySelector('.mse-title') as HTMLInputElement).value).toBe('From another tab');
    expect(editor.dirty).toBe(true);
  });

  it('saves with Ctrl+S when focus is on the page body', () => {
    const { store, editor } = setup();
    editor.addPanel('ms:color');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
    expect(editor.dirty).toBe(false);
    expect(Object.keys(store.get('lobby')!.layout!.panels)).toHaveLength(2);
  });

  it('starts empty when the store is empty', () => {
    const { host, editor } = setup([]);
    expect(editor.screenId).toBeUndefined();
    expect(editor.addPanel('ms:text')).toBeUndefined();
    expect((host.querySelector('.mse-title') as HTMLInputElement).disabled).toBe(true);
    (host.querySelector('.mse-side .mse-primary') as HTMLButtonElement).click();
    expect(editor.screenId).toBe('screen-1');
  });
});
