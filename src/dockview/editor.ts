import type { DockviewApi, IDockviewPanel } from 'dockview';
import type { Unsubscribe } from '../core/emitter.js';
import type { ScreenStore } from '../core/store.js';
import type { DisplaySpec, PanelDirection, ScreenDefinition, ThemeSpec } from '../core/types.js';
import { isValidId } from '../core/validate.js';
import type { PanelComponent, PanelRegistry } from './registry.js';
import { injectEditorStyles } from './styles.js';
import { themeNames } from './themes.js';
import { ScreenView, type ScreenViewOptions } from './view.js';

/** Texts of the editor. English by default; {@link editorLabelsFr} is provided. */
export interface EditorLabels {
  screens: string;
  newScreen: string;
  duplicate: string;
  delete: string;
  confirmDelete: string;
  untitled: string;
  palette: string;
  paletteHint: string;
  save: string;
  saved: string;
  unsaved: string;
  title: string;
  panel: string;
  noPanel: string;
  panelTitle: string;
  params: string;
  paramsJson: string;
  apply: string;
  removePanel: string;
  screen: string;
  id: string;
  route: string;
  routeHint: string;
  theme: string;
  themeDefault: string;
  resolution: string;
  native: string;
  hideTabs: string;
  locked: string;
  hideCursor: string;
  emptyCanvas: string;
  invalidJson: string;
  invalidRoute: string;
}

export const editorLabelsEn: EditorLabels = {
  screens: 'Screens',
  newScreen: 'New screen',
  duplicate: 'Duplicate',
  delete: 'Delete',
  confirmDelete: 'Confirm deletion?',
  untitled: 'Untitled screen',
  palette: 'Panels',
  paletteHint: 'Drag a panel onto the canvas, or click to add it next to the active one.',
  save: 'Save',
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  title: 'Screen title',
  panel: 'Selected panel',
  noPanel: 'Select a panel in the canvas to edit it.',
  panelTitle: 'Tab title',
  params: 'Parameters',
  paramsJson: 'Parameters (JSON)',
  apply: 'Apply',
  removePanel: 'Remove panel',
  screen: 'Screen',
  id: 'Id',
  route: 'Route',
  routeHint: 'e.g. /lobby or /hall/:zone',
  theme: 'Theme',
  themeDefault: 'Default',
  resolution: 'Resolution',
  native: 'Native',
  hideTabs: 'Hide tabs on devices',
  locked: 'Lock layout on devices',
  hideCursor: 'Hide cursor on devices',
  emptyCanvas: 'Drop panels here',
  invalidJson: 'Invalid JSON',
  invalidRoute: 'A route starts with /',
};

export const editorLabelsFr: EditorLabels = {
  screens: 'Écrans',
  newScreen: 'Nouvel écran',
  duplicate: 'Dupliquer',
  delete: 'Supprimer',
  confirmDelete: 'Confirmer la suppression ?',
  untitled: 'Écran sans titre',
  palette: 'Panneaux',
  paletteHint: 'Glissez un panneau sur le canevas, ou cliquez pour l’ajouter à côté du panneau actif.',
  save: 'Enregistrer',
  saved: 'Enregistré',
  unsaved: 'Modifications non enregistrées',
  title: 'Titre de l’écran',
  panel: 'Panneau sélectionné',
  noPanel: 'Sélectionnez un panneau dans le canevas pour le modifier.',
  panelTitle: 'Titre de l’onglet',
  params: 'Paramètres',
  paramsJson: 'Paramètres (JSON)',
  apply: 'Appliquer',
  removePanel: 'Retirer le panneau',
  screen: 'Écran',
  id: 'Identifiant',
  route: 'Route',
  routeHint: 'ex. /accueil ou /hall/:zone',
  theme: 'Thème',
  themeDefault: 'Par défaut',
  resolution: 'Résolution',
  native: 'Native',
  hideTabs: 'Masquer les onglets sur les écrans',
  locked: 'Verrouiller la disposition sur les écrans',
  hideCursor: 'Masquer le curseur sur les écrans',
  emptyCanvas: 'Déposez des panneaux ici',
  invalidJson: 'JSON invalide',
  invalidRoute: 'Une route commence par /',
};

export interface EditorAction {
  label: string;
  /** Receives the saved screen (the editor saves first). */
  run: (screen: ScreenDefinition) => void | Promise<void>;
}

export interface ScreenEditorOptions {
  registry: PanelRegistry;
  /** Library of screens edited (created, saved, deleted). */
  store: ScreenStore;
  /** Screen opened first. Default: the first of the store. */
  screenId?: string;
  /** Components offered in the palette. Default: every registered component. */
  palette?: string[];
  labels?: Partial<EditorLabels>;
  /** Theme names offered. Default: every registered theme. */
  themes?: string[];
  /** Resolutions offered, e.g. `[{ width: 1920, height: 1080 }]`. */
  resolutions?: { width: number; height: number }[];
  /** Save automatically after this many ms without change. Default: off. */
  autoSaveMs?: number;
  /** Extra toolbar buttons (send to devices, preview…). */
  actions?: EditorAction[];
  onSave?: (screen: ScreenDefinition) => void;
  /** Theme name of the canvas when a screen has none. */
  defaultTheme?: string;
  /** Extra options for the canvas view. */
  view?: Omit<ScreenViewOptions, 'registry' | 'screen' | 'onLayoutChange'>;
}

export interface ScreenEditor {
  readonly element: HTMLElement;
  /** The canvas (dockview api in `view.api`). */
  readonly view: ScreenView;
  /** Id of the screen being edited. */
  readonly screenId: string | undefined;
  readonly dirty: boolean;
  open(screenId: string): void;
  /** Creates a screen in the store and opens it. */
  create(init?: Partial<ScreenDefinition>): ScreenDefinition;
  /** Adds a panel of a palette component; next to the active panel by default. */
  addPanel(component: string, position?: { referencePanel?: string; referenceGroup?: string; direction?: PanelDirection }): IDockviewPanel | undefined;
  /** Saves the current screen into the store. */
  save(): ScreenDefinition | undefined;
  dispose(): void;
}

/** Drag payload of palette items (the type is also checked on drops). */
export const PALETTE_MIME = 'application/x-multi-screen-component';

type Draft = Omit<ScreenDefinition, 'panels' | 'layout' | 'version' | 'updatedAt'>;

const DEFAULT_RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 1080, height: 1920 },
  { width: 1280, height: 720 },
  { width: 3840, height: 2160 },
];

/**
 * A complete screen editor: library of screens, palette of predefined
 * panels, a dockview canvas where panels are dropped and arranged, and an
 * inspector for panel parameters and screen settings. Framework-free.
 */
export function createScreenEditor(container: HTMLElement, options: ScreenEditorOptions): ScreenEditor {
  const doc = container.ownerDocument;
  injectEditorStyles(doc);
  const labels: EditorLabels = { ...editorLabelsEn, ...options.labels };
  const { registry, store } = options;
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: (Node | string)[]) => {
    const el = doc.createElement(tag);
    Object.assign(el, props);
    el.append(...children);
    return el;
  };

  // ---- Layout -------------------------------------------------------------
  const root = h('div', { className: 'mse' });
  const side = h('aside', { className: 'mse-side' });
  const main = h('section', { className: 'mse-main' });
  const inspector = h('aside', { className: 'mse-inspector' });
  root.append(side, main, inspector);
  container.append(root);

  const screensTitle = h('h3', { className: 'mse-h' }, labels.screens);
  const newButton = h('button', { type: 'button', className: 'mse-btn mse-primary' }, `+ ${labels.newScreen}`);
  const screenList = h('ul', { className: 'mse-list' });
  const paletteTitle = h('h3', { className: 'mse-h' }, labels.palette);
  const paletteHint = h('p', { className: 'mse-hint' }, labels.paletteHint);
  const paletteList = h('ul', { className: 'mse-palette' });
  side.append(screensTitle, newButton, screenList, paletteTitle, paletteHint, paletteList);

  const titleInput = h('input', { type: 'text', className: 'mse-title' });
  titleInput.setAttribute('aria-label', labels.title);
  const saveButton = h('button', { type: 'button', className: 'mse-btn mse-primary' }, labels.save);
  const status = h('span', { className: 'mse-status', role: 'status' });
  const duplicateButton = h('button', { type: 'button', className: 'mse-btn' }, labels.duplicate);
  const deleteButton = h('button', { type: 'button', className: 'mse-btn mse-danger' }, labels.delete);
  const toolbar = h('div', { className: 'mse-toolbar' }, titleInput, saveButton, status);
  for (const action of options.actions ?? []) {
    const button = h('button', { type: 'button', className: 'mse-btn' }, action.label);
    button.onclick = async () => {
      const saved = save();
      if (saved) await action.run(saved);
    };
    toolbar.append(button);
  }
  toolbar.append(h('span', { className: 'mse-spacer' }), duplicateButton, deleteButton);
  const canvas = h('div', { className: 'mse-canvas' });
  const emptyNote = h('div', { className: 'mse-empty' }, labels.emptyCanvas);
  main.append(toolbar, canvas);

  // ---- Canvas -------------------------------------------------------------
  let dirty = false;
  let current: string | undefined;
  let draft: Draft | undefined;
  let savedVersion: number | undefined;
  let autoSave: ReturnType<typeof setTimeout> | undefined;
  let dragging: string | undefined;
  let counter = 0;

  const view = new ScreenView(canvas, {
    defaultTheme: options.defaultTheme ?? 'dark',
    ...options.view,
    registry,
    onLayoutChange: () => {
      markDirty();
      syncEmpty();
      renderInspector();
    },
  });
  canvas.append(emptyNote);
  const api: DockviewApi = view.api;

  const syncEmpty = () => {
    emptyNote.hidden = api.panels.length > 0 || !current;
  };

  const markDirty = () => {
    if (!current) return;
    dirty = true;
    status.textContent = labels.unsaved;
    status.dataset.state = 'dirty';
    saveButton.disabled = false;
    if (options.autoSaveMs !== undefined) {
      clearTimeout(autoSave);
      autoSave = setTimeout(() => save(), options.autoSaveMs);
    }
  };

  const markClean = () => {
    dirty = false;
    status.textContent = current ? labels.saved : '';
    status.dataset.state = 'clean';
    saveButton.disabled = true;
  };

  /** Device-only display settings are not applied in the editor. */
  const editorDisplay = (display: DisplaySpec | undefined): DisplaySpec => ({
    ...display,
    locked: false,
    hideTabs: false,
    cursor: 'auto',
    fullscreen: false,
    wakeLock: false,
    rotation: 0,
  });

  const applyDraftLook = () => {
    view.setTheme(draft?.theme);
    view.setDisplay(editorDisplay(draft?.display));
  };

  // External drops from the palette.
  const acceptDrag = (event: { accept(): void; nativeEvent: Event }) => {
    const native = event.nativeEvent as DragEvent;
    if (dragging || native.dataTransfer?.types.includes(PALETTE_MIME)) event.accept();
  };
  const dockApi = api as unknown as Record<string, unknown>;
  const unhandled = (dockApi.onUnhandledDragOver ?? dockApi.onUnhandledDragOverEvent) as ((cb: typeof acceptDrag) => { dispose(): void }) | undefined;
  const disposables: { dispose(): void }[] = [];
  if (unhandled) disposables.push(unhandled.call(api, acceptDrag));
  disposables.push(
    api.onDidDrop((event) => {
      const native = event.nativeEvent as DragEvent;
      const component = dragging ?? native.dataTransfer?.getData(PALETTE_MIME);
      if (!component || event.getData?.()) return;
      dragging = undefined;
      const direction = positionToDirection(event.position);
      if (event.group) addPanel(component, { referenceGroup: event.group.id, direction });
      else addPanel(component, direction === 'within' ? {} : { direction });
    }),
    api.onDidActivePanelChange(() => renderInspector()),
  );

  function addPanel(component: string, position: { referencePanel?: string; referenceGroup?: string; direction?: PanelDirection } = {}): IDockviewPanel | undefined {
    if (!current) return undefined;
    const spec = registry.get(component);
    const base = component.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '') || 'panel';
    let id = `${base}-${++counter}`;
    while (api.getPanel(id)) id = `${base}-${++counter}`;
    const reference = position.referencePanel ?? (position.referenceGroup ? undefined : api.activePanel?.id);
    const direction = position.direction ?? 'right';
    let placement: Record<string, unknown> | undefined;
    if (position.referenceGroup && api.getGroup(position.referenceGroup)) placement = { referenceGroup: position.referenceGroup, direction };
    else if (reference && api.getPanel(reference)) placement = { referencePanel: reference, direction };
    else if (position.direction && position.direction !== 'within' && api.panels.length) placement = { direction };
    const panel = api.addPanel({
      id,
      component,
      title: spec?.label ?? component,
      params: structuredClone(spec?.defaults ?? {}),
      ...(placement ? { position: placement } : {}),
    } as Parameters<DockviewApi['addPanel']>[0]);
    panel.api.setActive();
    markDirty();
    syncEmpty();
    renderInspector();
    return panel;
  }

  // ---- Palette ------------------------------------------------------------
  const paletteComponents = (): PanelComponent[] => {
    const names = options.palette;
    const all = registry.list();
    return names ? names.map((n) => all.find((c) => c.name === n)).filter((c): c is PanelComponent => !!c) : all;
  };
  for (const component of paletteComponents()) {
    const item = h('button', { type: 'button', className: 'mse-chip', draggable: true });
    item.dataset.component = component.name;
    item.append(h('span', { className: 'mse-chip-label' }, component.label ?? component.name), h('span', { className: 'mse-chip-name' }, component.name));
    item.addEventListener('dragstart', (event) => {
      dragging = component.name;
      event.dataTransfer?.setData(PALETTE_MIME, component.name);
      event.dataTransfer?.setData('text/plain', component.name);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    });
    item.addEventListener('dragend', () => {
      // `drop` fires before `dragend`: clear afterwards.
      setTimeout(() => (dragging = undefined), 0);
    });
    item.onclick = () => addPanel(component.name);
    paletteList.append(h('li', {}, item));
  }

  // ---- Screens list -------------------------------------------------------
  const renderScreens = () => {
    screenList.replaceChildren();
    for (const screen of store.list()) {
      const button = h('button', { type: 'button', className: 'mse-item' }, screen.title ?? screen.id);
      button.setAttribute('aria-current', String(screen.id === current));
      button.title = screen.id;
      button.onclick = () => open(screen.id);
      screenList.append(h('li', {}, button));
    }
  };

  // ---- Inspector ----------------------------------------------------------
  const renderInspector = () => {
    inspector.replaceChildren();
    if (!current || !draft) return;
    const panel = api.activePanel;
    const panelSection = h('section', { className: 'mse-section' }, h('h3', { className: 'mse-h' }, labels.panel));
    if (!panel) {
      panelSection.append(h('p', { className: 'mse-hint' }, labels.noPanel));
    } else {
      const component = registry.get(panelComponentName(panel));
      panelSection.append(h('p', { className: 'mse-hint' }, `${component?.label ?? panelComponentName(panel)} · ${panel.id}`));
      const titleField = h('input', { type: 'text', value: panel.title ?? panel.id });
      titleField.onchange = () => {
        panel.api.setTitle(titleField.value || panel.id);
        markDirty();
      };
      panelSection.append(field(labels.panelTitle, titleField));
      const params: Record<string, unknown> = { ...(panel.params ?? {}) };
      const keys = [...new Set([...Object.keys(component?.defaults ?? {}), ...Object.keys(params)])];
      const setParam = (key: string, value: unknown) => {
        const next = { ...(panel.params ?? {}), [key]: value };
        panel.api.updateParameters(next);
        json.value = JSON.stringify(next, null, 2);
        markDirty();
      };
      for (const key of keys) {
        const value = params[key] ?? component?.defaults?.[key];
        const input = paramInput(key, value, (v) => setParam(key, v));
        if (input) panelSection.append(field(key, input));
      }
      const json = h('textarea', { className: 'mse-json', spellcheck: false, value: JSON.stringify(params, null, 2) });
      json.setAttribute('aria-label', labels.paramsJson);
      const jsonError = h('span', { className: 'mse-error', role: 'alert' });
      const apply = h('button', { type: 'button', className: 'mse-btn' }, labels.apply);
      apply.onclick = () => {
        try {
          const parsed = JSON.parse(json.value) as unknown;
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
          const next: Record<string, unknown> = { ...(parsed as Record<string, unknown>) };
          for (const key of Object.keys(panel.params ?? {})) if (!(key in next)) next[key] = undefined;
          panel.api.updateParameters(next);
          jsonError.textContent = '';
          markDirty();
          renderInspector();
        } catch {
          jsonError.textContent = labels.invalidJson;
        }
      };
      const remove = h('button', { type: 'button', className: 'mse-btn mse-danger' }, labels.removePanel);
      remove.onclick = () => {
        panel.api.close();
        markDirty();
        syncEmpty();
        renderInspector();
      };
      panelSection.append(
        h('details', { className: 'mse-details' }, h('summary', {}, labels.paramsJson), json, h('div', { className: 'mse-row' }, apply, jsonError)),
        h('div', { className: 'mse-row' }, remove),
      );
    }

    const screenSection = h('section', { className: 'mse-section' }, h('h3', { className: 'mse-h' }, labels.screen));
    screenSection.append(field(labels.id, h('input', { type: 'text', value: current, readOnly: true })));
    const route = h('input', { type: 'text', value: draft.route ?? '', placeholder: labels.routeHint });
    const routeError = h('span', { className: 'mse-error', role: 'alert' });
    route.onchange = () => {
      const value = route.value.trim();
      if (value && !value.startsWith('/')) {
        routeError.textContent = labels.invalidRoute;
        return;
      }
      routeError.textContent = '';
      updateDraft((d) => {
        if (value) d.route = value;
        else delete d.route;
      });
    };
    screenSection.append(field(labels.route, route), routeError);

    const theme = h('select');
    theme.append(new Option(labels.themeDefault, ''), ...(options.themes ?? themeNames()).map((n) => new Option(n, n, false, n === draft!.theme?.base)));
    theme.onchange = () =>
      updateDraft((d) => {
        const { base: _b, ...rest } = d.theme ?? {};
        d.theme = theme.value ? { ...rest, base: theme.value } : rest;
        if (Object.keys(d.theme).length === 0) delete d.theme;
      });
    screenSection.append(field(labels.theme, theme));

    const resolution = h('select');
    const currentRes = draft.display?.resolution;
    resolution.append(new Option(labels.native, ''));
    for (const r of options.resolutions ?? DEFAULT_RESOLUTIONS) {
      const value = `${r.width}x${r.height}`;
      resolution.append(new Option(`${r.width} × ${r.height}`, value, false, currentRes?.width === r.width && currentRes?.height === r.height));
    }
    resolution.onchange = () =>
      updateDraft((d) => {
        const display = { ...d.display };
        if (resolution.value) {
          const [width, height] = resolution.value.split('x').map(Number) as [number, number];
          display.resolution = { width, height };
        } else delete display.resolution;
        d.display = display;
      });
    screenSection.append(field(labels.resolution, resolution));

    const flag = (label: string, read: (d: DisplaySpec) => boolean, write: (d: DisplaySpec, on: boolean) => void) => {
      const box = h('input', { type: 'checkbox', checked: read(draft!.display ?? {}) });
      box.onchange = () =>
        updateDraft((d) => {
          const display = { ...d.display };
          write(display, box.checked);
          d.display = display;
        });
      return h('label', { className: 'mse-check' }, box, label);
    };
    screenSection.append(
      flag(labels.hideTabs, (d) => d.hideTabs === true, (d, on) => (on ? (d.hideTabs = true) : delete d.hideTabs)),
      flag(labels.locked, (d) => d.locked === true, (d, on) => (on ? (d.locked = true) : delete d.locked)),
      flag(labels.hideCursor, (d) => d.cursor === 'none', (d, on) => (on ? (d.cursor = 'none') : delete d.cursor)),
    );
    inspector.append(panelSection, screenSection);
  };

  const updateDraft = (change: (d: Draft) => void) => {
    if (!draft) return;
    change(draft);
    if (draft.display && Object.keys(draft.display).length === 0) delete draft.display;
    applyDraftLook();
    markDirty();
  };

  const field = (label: string, input: HTMLElement) => {
    const id = `mse-${Math.random().toString(36).slice(2, 9)}`;
    input.id = id;
    return h('div', { className: 'mse-field' }, h('label', { htmlFor: id }, label), input);
  };

  const paramInput = (key: string, value: unknown, onChange: (v: unknown) => void): HTMLElement | undefined => {
    if (typeof value === 'boolean') {
      const box = h('input', { type: 'checkbox', checked: value });
      box.onchange = () => onChange(box.checked);
      return box;
    }
    if (typeof value === 'number') {
      const input = h('input', { type: 'number', value: String(value), step: 'any' });
      input.onchange = () => Number.isFinite(input.valueAsNumber) && onChange(input.valueAsNumber);
      return input;
    }
    if (typeof value === 'string' || value === undefined) {
      const isColor = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
      const input = h('input', { type: isColor ? 'color' : 'text', value: value ?? '' });
      if (/text|description|body/i.test(key) && !isColor) {
        const area = h('textarea', { value: value ?? '', rows: 3 });
        area.onchange = () => onChange(area.value);
        return area;
      }
      input.onchange = () => onChange(input.value);
      return input;
    }
    // Arrays and objects: edited through the JSON field.
    return undefined;
  };

  // ---- Open / create / save / delete -------------------------------------
  function open(screenId: string): void {
    const screen = store.get(screenId);
    if (!screen) return;
    if (dirty && current && current !== screenId) save();
    current = screenId;
    const { panels, layout, version, updatedAt: _u, ...rest } = screen;
    draft = structuredClone(rest);
    savedVersion = version;
    // Theme and display are driven by the draft, through the view overrides.
    view.render({ id: screen.id, ...(layout ? { layout } : {}), ...(panels ? { panels } : {}) });
    counter = api.panels.length;
    applyDraftLook();
    titleInput.value = screen.title ?? '';
    titleInput.disabled = false;
    duplicateButton.disabled = false;
    deleteButton.disabled = false;
    resetDelete();
    markClean();
    syncEmpty();
    renderScreens();
    renderInspector();
  }

  function create(init: Partial<ScreenDefinition> = {}): ScreenDefinition {
    let n = store.size + 1;
    let id = init.id && isValidId(init.id) ? init.id : `screen-${n}`;
    while (store.has(id)) id = `screen-${++n}`;
    const screen = store.put({ title: labels.untitled, panels: [], ...init, id });
    open(screen.id);
    titleInput.focus();
    titleInput.select();
    return screen;
  }

  function save(): ScreenDefinition | undefined {
    if (!current || !draft) return undefined;
    clearTimeout(autoSave);
    const screen: ScreenDefinition = { ...structuredClone(draft), id: current, layout: view.toJSON() };
    const saved = store.put(screen);
    savedVersion = saved.version;
    markClean();
    options.onSave?.(saved);
    return saved;
  }

  const resetDelete = () => {
    deleteButton.textContent = labels.delete;
    delete deleteButton.dataset.confirm;
  };

  titleInput.oninput = () => {
    if (!draft) return;
    draft.title = titleInput.value;
    markDirty();
  };
  saveButton.onclick = () => save();
  newButton.onclick = () => create();
  duplicateButton.onclick = () => {
    if (!current || !draft) return;
    create({ ...structuredClone(draft), title: `${draft.title ?? current} (2)`, layout: view.toJSON(), id: `${current}-copy` });
  };
  deleteButton.onclick = () => {
    if (!current) return;
    if (!deleteButton.dataset.confirm) {
      deleteButton.dataset.confirm = '1';
      deleteButton.textContent = labels.confirmDelete;
      return;
    }
    const removed = current;
    current = undefined;
    draft = undefined;
    dirty = false;
    store.remove(removed);
    const next = store.list()[0];
    if (next) open(next.id);
    else {
      view.render({ id: 'empty' });
      titleInput.value = '';
      titleInput.disabled = duplicateButton.disabled = deleteButton.disabled = true;
      markClean();
      syncEmpty();
      renderScreens();
      renderInspector();
    }
  };
  // Ctrl/Cmd+S saves, from inside the editor or when nothing else has focus.
  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
    const target = event.target as Node | null;
    if (target && target !== doc.body && target !== doc.documentElement && !root.contains(target)) return;
    event.preventDefault();
    save();
  };
  doc.addEventListener('keydown', onKeyDown);

  const unsubscribe: Unsubscribe = store.subscribe((event) => {
    renderScreens();
    // Changed elsewhere (another tab, a hub): reload unless the user is editing.
    if (event.type === 'put' && event.screen.id === current && event.screen.version !== savedVersion && !dirty) open(event.screen.id);
  });

  renderScreens();
  const first = options.screenId ?? store.list()[0]?.id;
  if (first && store.has(first)) open(first);
  else {
    titleInput.disabled = duplicateButton.disabled = deleteButton.disabled = true;
    markClean();
    syncEmpty();
  }

  return {
    element: root,
    view,
    get screenId() {
      return current;
    },
    get dirty() {
      return dirty;
    },
    open,
    create,
    addPanel,
    save,
    dispose() {
      clearTimeout(autoSave);
      doc.removeEventListener('keydown', onKeyDown);
      unsubscribe();
      for (const d of disposables) d.dispose();
      view.dispose();
      root.remove();
    },
  };
}

function panelComponentName(panel: IDockviewPanel): string {
  const json = panel.toJSON() as { contentComponent?: string };
  return json.contentComponent ?? '';
}

function positionToDirection(position: string): PanelDirection {
  switch (position) {
    case 'top':
      return 'above';
    case 'bottom':
      return 'below';
    case 'left':
      return 'left';
    case 'right':
      return 'right';
    default:
      return 'within';
  }
}

export type { ThemeSpec };
