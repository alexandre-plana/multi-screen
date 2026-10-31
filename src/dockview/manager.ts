import type { Unsubscribe } from '../core/emitter.js';
import type { DeviceRecord, ScreenHub } from '../core/hub.js';
import type { Target } from '../core/protocol.js';
import { createShareUrl } from '../core/share.js';
import type { ScreenStore } from '../core/store.js';
import type { ScreenDefinition } from '../core/types.js';
import { isValidId, validateScreen } from '../core/validate.js';
import type { PanelRegistry } from './registry.js';
import { injectManagerStyles } from './styles.js';
import { ScreenView } from './view.js';

/** Texts of the manager. English by default; {@link managerLabelsFr} is provided. */
export interface ManagerLabels {
  heading: string;
  search: string;
  sort: string;
  sortUpdated: string;
  sortTitle: string;
  sortId: string;
  newScreen: string;
  import: string;
  exportAll: string;
  selected: (n: number) => string;
  selectAll: string;
  deleteSelected: string;
  exportSelected: string;
  edit: string;
  send: string;
  sendTo: string;
  allDevices: string;
  noDevices: string;
  sendButton: string;
  duplicate: string;
  shareLink: string;
  linkCopied: string;
  export: string;
  delete: string;
  confirmDelete: string;
  panels: (n: number) => string;
  version: (v: number) => string;
  onDevices: (names: string[]) => string;
  notShown: string;
  empty: string;
  noMatch: string;
  imported: (n: number, failed: number) => string;
  sent: (ok: number, missing: number) => string;
  deleted: (n: number) => string;
  untitled: string;
}

export const managerLabelsEn: ManagerLabels = {
  heading: 'Screens',
  search: 'Search by title, id or route',
  sort: 'Sort',
  sortUpdated: 'Last modified',
  sortTitle: 'Title',
  sortId: 'Id',
  newScreen: 'New screen',
  import: 'Import',
  exportAll: 'Export all',
  selected: (n) => `${n} selected`,
  selectAll: 'Select all',
  deleteSelected: 'Delete selection',
  exportSelected: 'Export selection',
  edit: 'Edit',
  send: 'Send',
  sendTo: 'Send to',
  allDevices: 'All devices',
  noDevices: 'No device online',
  sendButton: 'Send',
  duplicate: 'Duplicate',
  shareLink: 'Share link',
  linkCopied: 'Link copied',
  export: 'Export',
  delete: 'Delete',
  confirmDelete: 'Confirm?',
  panels: (n) => `${n} panel${n > 1 ? 's' : ''}`,
  version: (v) => `v${v}`,
  onDevices: (names) => `On ${names.join(', ')}`,
  notShown: 'Not shown on any device',
  empty: 'No screen yet. Create one or import a JSON file.',
  noMatch: 'No screen matches the search.',
  imported: (n, failed) => `${n} screen(s) imported${failed ? `, ${failed} invalid` : ''}`,
  sent: (ok, missing) => `Sent to ${ok} device(s)${missing ? `, ${missing} without answer` : ''}`,
  deleted: (n) => `${n} screen(s) deleted`,
  untitled: 'Untitled screen',
};

export const managerLabelsFr: ManagerLabels = {
  heading: 'Écrans',
  search: 'Rechercher par titre, identifiant ou route',
  sort: 'Trier',
  sortUpdated: 'Dernière modification',
  sortTitle: 'Titre',
  sortId: 'Identifiant',
  newScreen: 'Nouvel écran',
  import: 'Importer',
  exportAll: 'Tout exporter',
  selected: (n) => `${n} sélectionné${n > 1 ? 's' : ''}`,
  selectAll: 'Tout sélectionner',
  deleteSelected: 'Supprimer la sélection',
  exportSelected: 'Exporter la sélection',
  edit: 'Éditer',
  send: 'Diffuser',
  sendTo: 'Diffuser sur',
  allDevices: 'Tous les appareils',
  noDevices: 'Aucun appareil en ligne',
  sendButton: 'Envoyer',
  duplicate: 'Dupliquer',
  shareLink: 'Lien de partage',
  linkCopied: 'Lien copié',
  export: 'Exporter',
  delete: 'Supprimer',
  confirmDelete: 'Confirmer ?',
  panels: (n) => `${n} panneau${n > 1 ? 'x' : ''}`,
  version: (v) => `v${v}`,
  onDevices: (names) => `Affiché sur ${names.join(', ')}`,
  notShown: 'Affiché sur aucun appareil',
  empty: 'Aucun écran pour l’instant. Créez-en un ou importez un fichier JSON.',
  noMatch: 'Aucun écran ne correspond à la recherche.',
  imported: (n, failed) => `${n} écran(s) importé(s)${failed ? `, ${failed} invalide(s)` : ''}`,
  sent: (ok, missing) => `Envoyé à ${ok} appareil(s)${missing ? `, ${missing} sans réponse` : ''}`,
  deleted: (n) => `${n} écran(s) supprimé(s)`,
  untitled: 'Écran sans titre',
};

export interface ScreenManagerOptions {
  /** Library of screens. */
  store: ScreenStore;
  /** Renders thumbnails. Without it, cards show no preview. */
  registry?: PanelRegistry;
  /** Enables "send", device badges, and removal from devices on delete. */
  hub?: ScreenHub;
  labels?: Partial<ManagerLabels>;
  /** "Edit" button and "New screen" target. Without it, those buttons are hidden. */
  onEdit?: (screenId: string) => void;
  /** Base URL of the device page for share links. Without it, the share button is hidden. */
  shareBaseUrl?: string;
  /** Virtual size of thumbnails. Default 1920×1080. */
  thumbnailResolution?: { width: number; height: number };
  /** Theme of thumbnails when a screen has none. */
  defaultTheme?: string;
  /** Locale for dates. Default: the browser's. */
  locale?: string;
}

export interface ScreenManager {
  readonly element: HTMLElement;
  /** Ids currently selected. */
  readonly selection: string[];
  /** Re-renders everything. */
  refresh(): void;
  /** Imports screens from JSON text (one screen or an array). Returns how many were imported. */
  importJson(text: string): { imported: string[]; failed: number };
  /** Screens serialised for export (all, or the given ids). */
  exportJson(ids?: string[]): string;
  dispose(): void;
}

type SortKey = 'updated' | 'title' | 'id';

/**
 * Overview of every screen of a library: live thumbnails, search and sort,
 * which devices show each screen, and the actions to edit, send, duplicate,
 * share, export, import and delete screens (one by one or in bulk).
 */
export function createScreenManager(container: HTMLElement, options: ScreenManagerOptions): ScreenManager {
  const doc = container.ownerDocument;
  injectManagerStyles(doc);
  const labels: ManagerLabels = { ...managerLabelsEn, ...options.labels };
  const { store, hub } = options;
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: (Node | string)[]) => {
    const el = doc.createElement(tag);
    Object.assign(el, props);
    el.append(...children);
    return el;
  };

  const root = h('div', { className: 'msm' });
  container.append(root);

  // ---- Toolbar ------------------------------------------------------------
  const search = h('input', { type: 'search', className: 'msm-search', placeholder: labels.search });
  search.setAttribute('aria-label', labels.search);
  const sort = h('select', { className: 'msm-sort' });
  sort.setAttribute('aria-label', labels.sort);
  sort.append(new Option(labels.sortUpdated, 'updated'), new Option(labels.sortTitle, 'title'), new Option(labels.sortId, 'id'));
  const newButton = h('button', { type: 'button', className: 'msm-btn msm-primary' }, `+ ${labels.newScreen}`);
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', multiple: true, hidden: true });
  const importButton = h('button', { type: 'button', className: 'msm-btn' }, labels.import);
  const exportAllButton = h('button', { type: 'button', className: 'msm-btn' }, labels.exportAll);
  const count = h('span', { className: 'msm-count' });
  const toolbar = h('div', { className: 'msm-toolbar' }, h('h2', { className: 'msm-heading' }, labels.heading), count, search, sort, h('span', { className: 'msm-spacer' }));
  if (options.onEdit) toolbar.append(newButton);
  toolbar.append(importButton, exportAllButton, fileInput);

  // ---- Bulk bar -----------------------------------------------------------
  const selectAll = h('input', { type: 'checkbox' });
  const selectedText = h('span');
  const bulkExport = h('button', { type: 'button', className: 'msm-btn' }, labels.exportSelected);
  const bulkDelete = h('button', { type: 'button', className: 'msm-btn msm-danger' }, labels.deleteSelected);
  const bulk = h('div', { className: 'msm-bulk' }, h('label', { className: 'msm-check' }, selectAll, labels.selectAll), selectedText, bulkExport, bulkDelete);
  const status = h('p', { className: 'msm-status', role: 'status' });
  const grid = h('ul', { className: 'msm-grid' });
  const empty = h('p', { className: 'msm-empty' });
  root.append(toolbar, bulk, status, grid, empty);

  const selection = new Set<string>();
  const cards = new Map<string, { li: HTMLLIElement; view?: ScreenView; render(screen: ScreenDefinition): void }>();
  const res = options.thumbnailResolution ?? { width: 1920, height: 1080 };
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  const say = (text: string) => {
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => (status.textContent = ''), 6000);
  };

  // ---- Thumbnails (lazy) --------------------------------------------------
  const observer =
    typeof IntersectionObserver !== 'undefined' && options.registry
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const id = (entry.target as HTMLElement).dataset.screenId!;
            observer!.unobserve(entry.target);
            mountThumbnail(id);
          }
        }, { rootMargin: '200px' })
      : undefined;

  const mountThumbnail = (id: string) => {
    const card = cards.get(id);
    const screen = store.get(id);
    if (!card || card.view || !screen || !options.registry) return;
    const host = card.li.querySelector<HTMLElement>('.msm-thumb')!;
    card.view = new ScreenView(host, {
      registry: options.registry,
      defaultTheme: options.defaultTheme ?? 'dark',
      // Thumbnails show the screen as a device would, at a fixed virtual size.
      display: { resolution: res, fit: 'contain', locked: true, cursor: 'auto', fullscreen: false, wakeLock: false, rotation: 0 },
      empty: (el) => (el.textContent = ''),
    });
    renderThumbnail(card.view, screen);
  };

  const renderThumbnail = (view: ScreenView, screen: ScreenDefinition) => {
    try {
      view.render(screen);
      view.setDisplay({ ...screen.display, resolution: screen.display?.resolution ?? res, fit: 'contain', locked: true, cursor: 'auto', fullscreen: false, wakeLock: false, rotation: 0 });
    } catch {
      // A broken layout shows an empty thumbnail; the editor will report it.
    }
  };

  // ---- Devices ------------------------------------------------------------
  const devicesShowing = (id: string): DeviceRecord[] => (hub ? hub.devices().filter((d) => d.online && d.state.screenId === id) : []);

  const sendMenu = (screen: ScreenDefinition): HTMLElement => {
    const details = h('details', { className: 'msm-menu' });
    const summary = h('summary', { className: 'msm-btn' }, labels.send);
    const panel = h('div', { className: 'msm-menu-panel' });
    details.append(summary, panel);
    details.addEventListener('toggle', () => {
      if (!details.open || !hub) return;
      panel.replaceChildren(h('p', { className: 'msm-menu-title' }, labels.sendTo));
      const online = hub.devices().filter((d) => d.online);
      if (!online.length) {
        panel.append(h('p', { className: 'msm-muted' }, labels.noDevices));
        return;
      }
      const all = h('input', { type: 'checkbox', checked: true, value: '*' });
      const boxes = online.map((d) => h('input', { type: 'checkbox', value: d.info.id }));
      all.onchange = () => boxes.forEach((b) => (b.disabled = all.checked));
      boxes.forEach((b) => (b.disabled = true));
      panel.append(h('label', { className: 'msm-check' }, all, labels.allDevices));
      online.forEach((d, i) => panel.append(h('label', { className: 'msm-check' }, boxes[i]!, d.info.name ?? d.info.id)));
      const go = h('button', { type: 'button', className: 'msm-btn msm-primary' }, labels.sendButton);
      go.onclick = async () => {
        const target: Target = all.checked ? '*' : boxes.filter((b) => b.checked).map((b) => b.value);
        if (Array.isArray(target) && !target.length) return;
        details.open = false;
        const latest = store.get(screen.id);
        if (!latest) return;
        const result = await hub.show(target, latest);
        say(labels.sent(result.acks.filter((a) => a.ok).length, result.missing.length));
      };
      panel.append(go);
    });
    return details;
  };

  // ---- Cards --------------------------------------------------------------
  const formatDate = (iso?: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(options.locale, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const panelCount = (screen: ScreenDefinition) => (screen.layout ? Object.keys(screen.layout.panels).length : (screen.panels?.length ?? 0));

  const createCard = (screen: ScreenDefinition) => {
    const li = h('li', { className: 'msm-card' });
    li.dataset.screenId = screen.id;
    const thumb = h('div', { className: 'msm-thumb' });
    thumb.style.aspectRatio = `${(screen.display?.resolution ?? res).width} / ${(screen.display?.resolution ?? res).height}`;
    thumb.dataset.screenId = screen.id;
    thumb.setAttribute('aria-hidden', 'true');
    const check = h('input', { type: 'checkbox', className: 'msm-select' });
    const title = h('h3', { className: 'msm-title' });
    const meta = h('p', { className: 'msm-meta' });
    const route = h('code', { className: 'msm-route' });
    const devices = h('p', { className: 'msm-devices' });
    const actions = h('div', { className: 'msm-actions' });
    li.append(h('div', { className: 'msm-thumb-wrap' }, thumb, check), h('div', { className: 'msm-body' }, title, route, meta, devices), actions);

    check.onchange = () => {
      if (check.checked) selection.add(screen.id);
      else selection.delete(screen.id);
      li.classList.toggle('msm-selected', check.checked);
      updateBulk();
    };

    if (options.onEdit) {
      const edit = h('button', { type: 'button', className: 'msm-btn msm-primary' }, labels.edit);
      edit.onclick = () => options.onEdit!(screen.id);
      thumb.onclick = () => options.onEdit!(screen.id);
      thumb.classList.add('msm-clickable');
      actions.append(edit);
    }
    if (hub) actions.append(sendMenu(screen));
    const more = h('details', { className: 'msm-menu' });
    const morePanel = h('div', { className: 'msm-menu-panel msm-menu-right' });
    more.append(h('summary', { className: 'msm-btn', title: '…' }, '⋯'), morePanel);
    more.querySelector('summary')!.setAttribute('aria-label', `${labels.duplicate}, ${labels.export}…`);
    const duplicate = h('button', { type: 'button', className: 'msm-link' }, labels.duplicate);
    duplicate.onclick = () => {
      more.open = false;
      const source = store.get(screen.id);
      if (!source) return;
      const { version: _v, updatedAt: _u, ...rest } = source;
      const copy = store.put({ ...rest, id: uniqueId(`${screen.id}-copy`), title: `${source.title ?? source.id} (2)` });
      highlight(copy.id);
    };
    const exportOne = h('button', { type: 'button', className: 'msm-link' }, labels.export);
    exportOne.onclick = () => {
      more.open = false;
      download(`${screen.id}.json`, api.exportJson([screen.id]));
    };
    morePanel.append(duplicate, exportOne);
    if (options.shareBaseUrl) {
      const share = h('button', { type: 'button', className: 'msm-link' }, labels.shareLink);
      share.onclick = async () => {
        more.open = false;
        const latest = store.get(screen.id);
        if (!latest) return;
        const url = await createShareUrl(latest, { baseUrl: options.shareBaseUrl! });
        try {
          await navigator.clipboard.writeText(url);
          say(labels.linkCopied);
        } catch {
          say(url);
        }
      };
      morePanel.append(share);
    }
    const remove = h('button', { type: 'button', className: 'msm-link msm-danger' }, labels.delete);
    remove.onclick = () => {
      if (!remove.dataset.confirm) {
        remove.dataset.confirm = '1';
        remove.textContent = labels.confirmDelete;
        return;
      }
      more.open = false;
      deleteScreens([screen.id]);
    };
    more.addEventListener('toggle', () => {
      if (!more.open) {
        delete remove.dataset.confirm;
        remove.textContent = labels.delete;
      }
    });
    morePanel.append(remove);
    actions.append(more);

    const card = {
      li,
      view: undefined as ScreenView | undefined,
      render(next: ScreenDefinition) {
        title.textContent = next.title || labels.untitled;
        route.textContent = next.route ?? `#${next.id}`;
        route.title = next.route ? next.route : next.id;
        const parts = [labels.version(next.version ?? 1), labels.panels(panelCount(next))];
        if (next.theme?.base) parts.push(next.theme.base);
        const date = formatDate(next.updatedAt);
        if (date) parts.push(date);
        meta.textContent = parts.join(' · ');
        thumb.style.aspectRatio = `${(next.display?.resolution ?? res).width} / ${(next.display?.resolution ?? res).height}`;
        if (card.view) renderThumbnail(card.view, next);
        renderDevices();
      },
    };
    const renderDevices = () => {
      if (!hub) {
        devices.hidden = true;
        return;
      }
      const showing = devicesShowing(screen.id);
      devices.textContent = showing.length ? labels.onDevices(showing.map((d) => d.info.name ?? d.info.id)) : labels.notShown;
      devices.classList.toggle('msm-live', showing.length > 0);
    };
    (card as { renderDevices?: () => void }).renderDevices = renderDevices;
    cards.set(screen.id, card);
    card.render(screen);
    if (observer) observer.observe(thumb);
    else if (options.registry) mountThumbnail(screen.id);
    return card;
  };

  const destroyCard = (id: string) => {
    const card = cards.get(id);
    if (!card) return;
    card.view?.dispose();
    const thumb = card.li.querySelector('.msm-thumb');
    if (thumb && observer) observer.unobserve(thumb);
    card.li.remove();
    cards.delete(id);
    selection.delete(id);
  };

  // ---- Listing ------------------------------------------------------------
  const visibleScreens = (): ScreenDefinition[] => {
    const q = search.value.trim().toLowerCase();
    const key = sort.value as SortKey;
    return store
      .list()
      .filter((s) => !q || [s.title, s.id, s.route].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) =>
        key === 'title'
          ? (a.title ?? a.id).localeCompare(b.title ?? b.id, options.locale)
          : key === 'id'
            ? a.id.localeCompare(b.id)
            : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      );
  };

  const refresh = () => {
    const screens = visibleScreens();
    const ids = new Set(store.list().map((s) => s.id));
    for (const id of [...cards.keys()]) if (!ids.has(id)) destroyCard(id);
    // Keep existing cards (and their thumbnails), only reorder and filter.
    const order: HTMLLIElement[] = [];
    for (const screen of screens) order.push((cards.get(screen.id) ?? createCard(screen)).li);
    for (const card of cards.values()) card.li.hidden = !order.includes(card.li);
    grid.append(...order);
    count.textContent = String(store.size);
    empty.textContent = store.size === 0 ? labels.empty : screens.length === 0 ? labels.noMatch : '';
    empty.hidden = empty.textContent === '';
    updateBulk();
  };

  const updateBulk = () => {
    for (const id of [...selection]) if (!store.has(id)) selection.delete(id);
    bulk.hidden = store.size === 0;
    selectedText.textContent = selection.size ? labels.selected(selection.size) : '';
    bulkExport.disabled = bulkDelete.disabled = selection.size === 0;
    selectAll.checked = selection.size > 0 && selection.size === store.size;
    selectAll.indeterminate = selection.size > 0 && selection.size < store.size;
    if (!selection.size) {
      delete bulkDelete.dataset.confirm;
      bulkDelete.textContent = labels.deleteSelected;
    }
  };

  const highlight = (id: string) => {
    queueMicrotask(() => {
      const li = cards.get(id)?.li;
      if (!li) return;
      li.classList.add('msm-flash');
      li.scrollIntoView?.({ block: 'nearest' });
      setTimeout(() => li.classList.remove('msm-flash'), 1200);
    });
  };

  const uniqueId = (base: string) => {
    let id = base.replace(/[^A-Za-z0-9._:-]+/g, '-').slice(0, 120) || 'screen';
    if (!isValidId(id)) id = `screen-${id}`;
    let candidate = id;
    for (let n = 2; store.has(candidate); n++) candidate = `${id}-${n}`;
    return candidate;
  };

  const deleteScreens = (ids: string[]) => {
    for (const id of ids) {
      // Devices holding the screen forget it too.
      if (hub) {
        const holders = hub.devices().filter((d) => d.online && d.state.screens.some((s) => s.id === id)).map((d) => d.info.id);
        if (holders.length) void hub.remove(holders, id);
      }
      store.remove(id);
    }
    say(labels.deleted(ids.length));
  };

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    root.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ---- Wiring -------------------------------------------------------------
  search.oninput = () => refresh();
  sort.onchange = () => refresh();
  newButton.onclick = () => {
    const screen = store.put({ id: uniqueId('screen'), title: labels.untitled, panels: [] });
    options.onEdit?.(screen.id);
  };
  importButton.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    let imported = 0;
    let failed = 0;
    for (const file of [...(fileInput.files ?? [])]) {
      const result = api.importJson(await file.text());
      imported += result.imported.length;
      failed += result.failed;
    }
    fileInput.value = '';
    say(labels.imported(imported, failed));
  };
  exportAllButton.onclick = () => download('screens.json', api.exportJson());
  selectAll.onchange = () => {
    const ids = selectAll.checked ? visibleScreens().map((s) => s.id) : [];
    selection.clear();
    for (const id of ids) selection.add(id);
    for (const [id, card] of cards) {
      const box = card.li.querySelector<HTMLInputElement>('.msm-select')!;
      box.checked = selection.has(id);
      card.li.classList.toggle('msm-selected', box.checked);
    }
    updateBulk();
  };
  bulkExport.onclick = () => download('screens.json', api.exportJson([...selection]));
  bulkDelete.onclick = () => {
    if (!bulkDelete.dataset.confirm) {
      bulkDelete.dataset.confirm = '1';
      bulkDelete.textContent = `${labels.deleteSelected} — ${labels.confirmDelete}`;
      return;
    }
    deleteScreens([...selection]);
  };

  const cleanups: Unsubscribe[] = [
    store.subscribe((event) => {
      if (event.type === 'put') cards.get(event.screen.id)?.render(event.screen);
      refresh();
    }),
  ];
  if (hub) {
    cleanups.push(
      hub.subscribe((event) => {
        if (event.type !== 'devices') return;
        for (const card of cards.values()) (card as { renderDevices?: () => void }).renderDevices?.();
      }),
    );
  }

  const api: ScreenManager = {
    element: root,
    get selection() {
      return [...selection];
    },
    refresh,
    importJson(text) {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        return { imported: [], failed: 1 };
      }
      const items = Array.isArray(data) ? data : [data];
      const imported: string[] = [];
      let failed = 0;
      for (const item of items) {
        try {
          const { version: _v, updatedAt: _u, ...screen } = validateScreen(item);
          // Never overwrite silently: an existing id gets a suffix.
          const id = store.has(screen.id) ? uniqueId(`${screen.id}-import`) : screen.id;
          imported.push(store.put({ ...screen, id }).id);
        } catch {
          failed++;
        }
      }
      if (imported[0]) highlight(imported[0]);
      return { imported, failed };
    },
    exportJson(ids) {
      const screens = ids ? ids.map((id) => store.get(id)).filter((s): s is ScreenDefinition => !!s) : store.list();
      return JSON.stringify(screens, null, 2);
    },
    dispose() {
      clearTimeout(statusTimer);
      for (const cleanup of cleanups) cleanup();
      observer?.disconnect();
      for (const id of [...cards.keys()]) destroyCard(id);
      root.remove();
    },
  };

  refresh();
  return api;
}
