import { createScreenHub, createScreenStore, createShareUrl, validateScreen, webStorage, type DeviceRecord, type DisplaySpec, type Rotation, type ScreenDefinition, type Target } from 'multi-screen';
import { mountScreen, themeNames } from 'multi-screen/dockview';
import { createDemoRegistry, presets, transportFromUrl } from './shared';
import { mountLogo } from './site';

mountLogo();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const { transport, label } = transportFromUrl();
$('transport').textContent = label;

const store = createScreenStore({ storage: webStorage('multi-screen-demo:library') });
await store.ready;
for (const preset of presets) if (!store.has(preset.id)) store.put(preset);

const hub = createScreenHub({ transport, store });
const selected = new Set<string>();
let current = store.list()[0]?.id ?? 'accueil';

// ---- Status line -----------------------------------------------------------
const status = (text: string, error = false) => {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('err', error);
};

const target = (): Target | undefined => {
  const tag = $<HTMLInputElement>('tag').value.trim();
  if (selected.size) return [...selected];
  if (tag) return `tag:${tag}`;
  status('Choisissez au moins un écran ou une étiquette.', true);
  return undefined;
};

const report = (what: string, result: { acks: { ok: boolean; error?: string }[]; missing: string[] }) => {
  const ok = result.acks.filter((a) => a.ok).length;
  const failed = result.acks.filter((a) => !a.ok);
  status(
    `${what} : ${ok} écran(s) OK${failed.length ? `, ${failed.length} refus (${failed.map((f) => f.error).join(', ')})` : ''}${result.missing.length ? `, ${result.missing.length} sans réponse` : ''}`,
    failed.length > 0 || result.missing.length > 0,
  );
};

// ---- Devices ---------------------------------------------------------------
const renderDevices = (devices: DeviceRecord[]) => {
  const list = $('devices');
  list.replaceChildren();
  if (!devices.length) {
    const li = document.createElement('li');
    li.className = 'empty-note';
    li.textContent = 'Aucun écran. Ouvrez-en un avec le bouton « Ouvrir un écran ».';
    list.append(li);
  }
  for (const device of devices) {
    const li = document.createElement('li');
    li.className = 'item';
    li.setAttribute('aria-current', String(selected.has(device.info.id)));
    const row = document.createElement('div');
    row.className = 'row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = selected.has(device.info.id);
    box.setAttribute('aria-label', `Cibler ${device.info.name ?? device.info.id}`);
    box.onchange = () => {
      if (box.checked) selected.add(device.info.id);
      else selected.delete(device.info.id);
      li.setAttribute('aria-current', String(box.checked));
    };
    const dot = document.createElement('span');
    dot.className = `dot${device.online ? ' on' : ''}`;
    dot.title = device.online ? 'En ligne' : 'Hors ligne';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = device.info.name ?? device.info.id;
    const identify = document.createElement('button');
    identify.type = 'button';
    identify.textContent = 'Identifier';
    identify.disabled = !device.online;
    identify.onclick = () => void hub.identify(device.info.id);
    row.append(box, dot, name, identify);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const screen = device.state.screenId ? (store.get(device.state.screenId)?.title ?? device.state.screenId) : 'aucun écran';
    const vp = device.info.viewport ? ` · ${device.info.viewport.width}×${device.info.viewport.height}` : '';
    meta.textContent = `${screen} · ${device.state.path ?? '/'}${vp}${device.info.tags?.length ? ` · #${device.info.tags.join(' #')}` : ''}`;
    li.append(row, meta);
    list.append(li);
  }
};
hub.subscribe((event) => event.type === 'devices' && renderDevices(event.devices));
renderDevices(hub.devices());
$('discover').onclick = () => hub.discover();
let opened = 0;
$('open-device').onclick = () => {
  opened++;
  const id = `ecran-${Date.now().toString(36).slice(-4)}`;
  const url = new URL('./device.html', location.href);
  url.search = location.search;
  url.searchParams.set('id', id);
  url.searchParams.set('name', `Écran ${opened}`);
  open(url, id, 'popup,width=800,height=500');
};

// ---- Screen library, preview and editor ------------------------------------
const registry = createDemoRegistry();
let editingFromPreview = false;
const preview = mountScreen($('preview'), {
  registry,
  // Rearranging the preview edits the screen: its layout is captured.
  onLayoutChange: () => {
    const captured = preview.toScreen();
    if (!captured) return;
    editingFromPreview = true;
    $<HTMLTextAreaElement>('json').value = JSON.stringify(strip(captured), null, 2);
    editingFromPreview = false;
    status('Disposition modifiée dans l’aperçu : enregistrez pour la diffuser.');
  },
});

const strip = ({ version: _v, updatedAt: _u, ...screen }: ScreenDefinition) => screen;

const renderLibrary = () => {
  const select = $<HTMLSelectElement>('screen');
  select.replaceChildren(...store.list().map((s) => new Option(`${s.title ?? s.id} (v${s.version})`, s.id, false, s.id === current)));
};
const showCurrent = () => {
  const screen = store.get(current);
  if (!screen) return;
  preview.render(screen);
  if (!editingFromPreview) $<HTMLTextAreaElement>('json').value = JSON.stringify(strip(screen), null, 2);
};
store.subscribe(() => {
  renderLibrary();
  showCurrent();
});
renderLibrary();
showCurrent();

$<HTMLSelectElement>('screen').onchange = (e) => {
  current = (e.target as HTMLSelectElement).value;
  showCurrent();
};
$('new-screen').onclick = () => {
  const id = `ecran-${store.size + 1}`;
  store.put({ id, title: `Nouvel écran ${store.size + 1}`, panels: [{ id: 'texte', component: 'ms:text', params: { text: 'Nouvel écran' } }] });
  current = id;
  renderLibrary();
  showCurrent();
};

$('save').onclick = async () => {
  let screen: ScreenDefinition;
  try {
    screen = validateScreen({ ...JSON.parse($<HTMLTextAreaElement>('json').value), id: current });
  } catch (error) {
    status((error as Error).message, true);
    return;
  }
  const results = await hub.update(current, () => screen);
  const count = results.reduce((n, r) => n + r.acks.filter((a) => a.ok).length, 0);
  status(`Enregistré (v${store.get(current)?.version}) · ${count} écran(s) mis à jour en direct`);
};

$('send').onclick = async () => {
  const to = target();
  if (to) report('Envoi', await hub.show(to, current));
};

$('share').onclick = async () => {
  const screen = store.get(current)!;
  const url = await createShareUrl(screen, { baseUrl: new URL('./device.html', location.href).toString() });
  try {
    await navigator.clipboard.writeText(url);
    status(`Lien copié (${url.length} caractères).`);
  } catch {
    prompt('Lien de partage', url);
  }
};

// ---- Theme and display -----------------------------------------------------
$<HTMLSelectElement>('theme').append(...themeNames().map((name) => new Option(name, name)));
$('apply-theme').onclick = async () => {
  const to = target();
  if (!to) return;
  const base = $<HTMLSelectElement>('theme').value;
  const accent = $<HTMLInputElement>('accent').value;
  report('Thème', await hub.setTheme(to, { ...(base ? { base } : {}), variables: { '--demo-accent': accent } }));
};

$('apply-display').onclick = async () => {
  const to = target();
  if (!to) return;
  const display: DisplaySpec = {};
  const rotation = $<HTMLSelectElement>('rotation').value;
  if (rotation) display.rotation = Number(rotation) as Rotation;
  const scale = $<HTMLInputElement>('scale').valueAsNumber;
  if (Number.isFinite(scale)) display.scale = scale;
  const resolution = $<HTMLSelectElement>('resolution').value;
  if (resolution) {
    const [width, height] = resolution.split('x').map(Number) as [number, number];
    display.resolution = { width, height };
  }
  for (const key of ['hideTabs', 'locked', 'fullscreen'] as const) display[key] = $<HTMLInputElement>(key).checked;
  display.cursor = $<HTMLInputElement>('cursor').checked ? 'none' : 'auto';
  report('Affichage', await hub.setDisplay(to, display));
};

$('reset').onclick = async () => {
  const to = target();
  if (!to) return;
  await hub.setTheme(to, null);
  report('Réinitialisation', await hub.setDisplay(to, null));
};

$('navigate').onclick = async () => {
  const to = target();
  const path = $<HTMLInputElement>('path').value.trim();
  if (to && path.startsWith('/')) report('Navigation', await hub.navigate(to, path));
};

// ---- Playlist (application command) ---------------------------------------
$('playlist-start').onclick = async () => {
  const to = target();
  if (!to) return;
  const seconds = Math.max(2, $<HTMLInputElement>('playlist-seconds').valueAsNumber || 8);
  const screens = store.list().filter((s) => !s.route?.includes(':'));
  // Devices must hold the screens before rotating through them.
  for (const screen of screens) await hub.show(to, screen, { navigate: false });
  report('Playlist', await hub.command(to, 'playlist', screens.map((s) => ({ screenId: s.id, durationMs: seconds * 1000 }))));
};
$('playlist-stop').onclick = async () => {
  const to = target();
  if (to) report('Playlist', await hub.command(to, 'playlist', []));
};
