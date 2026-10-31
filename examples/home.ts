import {
  contentHash, createMemoryBus, createScreenDevice, createScreenHub, createScreenRouter, createScreenStore, memoryRouter,
  type AnyEnvelope, type DisplaySpec, type ScreenHub, type ScreenDefinition, type ScreenDevice, type Target, type Transport,
} from 'multi-screen';
import { createScreenOutlet, mountScreen } from 'multi-screen/dockview';
import { createDemoRegistry } from './shared';
import { codeBlock, copyText, enhanceCode, mountLogo } from './site';

mountLogo();
enhanceCode();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const fmtBytes = (n: number) => (n < 1024 ? `${n} o` : `${(n / 1024).toFixed(1).replace('.', ',')} ko`);
const euros = (n: number) => `${n.toLocaleString('fr-FR')} €`;

// ---------------------------------------------------------------------------
// Screens of the demo
// ---------------------------------------------------------------------------
const registry = createDemoRegistry();

const ventesPanels: ScreenDefinition = {
  id: 'ventes',
  title: 'Ventes',
  route: '/tableaux/ventes',
  theme: { base: 'githubDark' },
  panels: [
    { id: 'ca', component: 'demo:kpi', title: "Chiffre d'affaires", params: { label: "Chiffre d'affaires", value: 128400, unit: '€', trend: 4.2 } },
    { id: 'commandes', component: 'demo:kpi', title: 'Commandes', params: { label: 'Commandes', value: 342, trend: -1.5 }, position: { referencePanel: 'ca', direction: 'right' } },
    { id: 'semaine', component: 'demo:bars', title: 'Semaine', params: { title: 'Ventes par jour', values: [12, 18, 9, 22, 30, 26, 14] }, position: { referencePanel: 'ca', direction: 'below' } },
  ],
};

/** Captures the exact dockview layout, as the editor does: patches then touch a single panel. */
function toLayoutScreen(screen: ScreenDefinition): ScreenDefinition {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:960px;height:540px';
  document.body.append(host);
  const view = mountScreen(host, { registry, screen });
  const captured = view.toScreen()!;
  view.dispose();
  host.remove();
  return captured;
}

const screens: ScreenDefinition[] = [
  toLayoutScreen(ventesPanels),
  {
    id: 'accueil',
    title: 'Accueil',
    route: '/accueil',
    theme: { base: 'abyss' },
    display: { hideTabs: true },
    panels: [
      { id: 'bienvenue', component: 'ms:text', title: 'Bienvenue', params: { text: 'Bienvenue', size: '2.6em' } },
      { id: 'heure', component: 'ms:clock', title: 'Heure', params: { timeZone: 'Europe/Paris', seconds: false, size: '2.2em' }, position: { referencePanel: 'bienvenue', direction: 'below' } },
    ],
  },
  {
    id: 'operations',
    title: 'Opérations',
    route: '/operations/:site',
    theme: { base: 'nord' },
    panels: [
      {
        id: 'etat', component: 'demo:status', title: 'État',
        params: { title: 'Lignes', rows: [{ label: 'Ligne A', state: 'ok', detail: 'Nominal' }, { label: 'Ligne B', state: 'warn', detail: '+4 min' }, { label: 'Ligne C', state: 'ok', detail: 'Nominal' }] },
      },
      { id: 'flux', component: 'demo:line', title: 'Flux', params: { title: 'Fréquentation', values: [12, 18, 15, 24, 30, 27, 35, 31, 38], unit: 'pers.' }, position: { referencePanel: 'etat', direction: 'right' } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Bus, hub and devices — the real library, in this page
// ---------------------------------------------------------------------------
const bus = createMemoryBus();
const listeners: ((message: AnyEnvelope) => void)[] = [];
const tap = (transport: Transport): Transport => ({
  ...transport,
  send(message) {
    for (const l of listeners) l(message);
    transport.send(message);
  },
  subscribe: (l) => transport.subscribe(l),
});

// eslint-disable-next-line prefer-const
let hub: ScreenHub;

type DeviceDef = { id: string; name: string; tags: string[]; kind: 'tv' | 'kiosk' | 'tablet'; width: number; height: number };
const deviceDefs: DeviceDef[] = [
  { id: 'tv', name: 'TV Hall', tags: ['hall'], kind: 'tv', width: 800, height: 450 },
  { id: 'borne', name: 'Borne', tags: ['hall', 'accueil'], kind: 'kiosk', width: 360, height: 640 },
  { id: 'tablette', name: 'Tablette', tags: ['bureau'], kind: 'tablet', width: 640, height: 480 },
];
const devices = new Map<string, { def: DeviceDef; device: ScreenDevice; frame: HTMLElement; path: HTMLElement }>();

function createDevices() {
for (const def of deviceDefs) {
  const wrap = document.createElement('div');
  wrap.className = `device device-${def.kind}`;
  wrap.innerHTML = `<div class="device-frame"></div><div class="device-meta"><span class="device-name"><i></i>${def.name}</span><span class="device-path">/</span><span class="device-tags">${def.tags.map((t) => `#${t}`).join(' ')}</span></div>`;
  $('devices').append(wrap);
  const frame = wrap.querySelector<HTMLElement>('.device-frame')!;
  // Each device has a real resolution; the frame shows it scaled, like a physical screen.
  const screenEl = document.createElement('div');
  screenEl.className = 'device-screen';
  screenEl.style.width = `${def.width}px`;
  screenEl.style.height = `${def.height}px`;
  frame.append(screenEl);
  new ResizeObserver(() => {
    screenEl.style.transform = `scale(${frame.clientWidth / def.width})`;
  }).observe(frame);
  const device = createScreenDevice({
    transport: tap(bus.connect()),
    info: { id: def.id, name: def.name, tags: def.tags, kind: def.kind },
    router: createScreenRouter({ adapter: memoryRouter('/') }),
    heartbeatMs: 0,
  });
  createScreenOutlet(screenEl, { registry, router: device.router, device, empty: (el) => (el.textContent = 'En attente…') });
  const path = wrap.querySelector<HTMLElement>('.device-path')!;
  device.subscribe((event) => {
    if (event.type === 'state') path.textContent = event.state.path ?? '/';
  });
  devices.set(def.id, { def, device, frame, path });
}
}

// ---------------------------------------------------------------------------
// Wires and packets
// ---------------------------------------------------------------------------
const svg = $('wires') as unknown as SVGSVGElement;
const paths = new Map<string, SVGPathElement>();
const NS = 'http://www.w3.org/2000/svg';

function drawWires() {
  const stage = $('stage').getBoundingClientRect();
  const hubBox = $('hub-node').getBoundingClientRect();
  const vertical = innerWidth <= 640;
  const hx = vertical ? hubBox.left + hubBox.width / 2 - stage.left : hubBox.right - stage.left;
  const hy = vertical ? hubBox.bottom - stage.top : hubBox.top + hubBox.height / 2 - stage.top;
  svg.replaceChildren();
  paths.clear();
  for (const [id, { frame }] of devices) {
    const box = frame.getBoundingClientRect();
    const dx = box.left + box.width / 2 - stage.left;
    const dy = box.top - stage.top - 4;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('class', 'wire');
    path.setAttribute('d', vertical ? `M${hx},${hy} C${hx},${hy + 30} ${dx},${dy - 30} ${dx},${dy}` : `M${hx},${hy} C${hx + 70},${hy} ${dx},${dy - 70} ${dx},${dy}`);
    svg.append(path);
    paths.set(id, path);
  }
}
new ResizeObserver(() => drawWires()).observe($('stage'));
addEventListener('resize', drawWires);

const COLORS: Record<string, string> = { command: '#5b8cff', patch: '#f5b544', ack: '#3ddc97', hello: '#a78bfa' };
function packet(deviceId: string, outbound: boolean, kind: string) {
  const path = paths.get(deviceId);
  if (!path) return;
  const length = path.getTotalLength();
  const dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', '3.6');
  dot.setAttribute('class', 'packet');
  dot.setAttribute('fill', COLORS[kind] ?? COLORS.command!);
  dot.style.color = COLORS[kind] ?? COLORS.command!;
  svg.append(dot);
  const start = performance.now();
  const duration = reduceMotion ? 1 : 560;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const p = path.getPointAtLength((outbound ? e : 1 - e) * length);
    dot.setAttribute('cx', String(p.x));
    dot.setAttribute('cy', String(p.y));
    if (t < 1) requestAnimationFrame(step);
    else {
      dot.remove();
      const target = outbound ? devices.get(deviceId)?.frame : $('hub-node');
      target?.classList.remove('ping', 'pulse');
      void target?.offsetWidth;
      target?.classList.add(outbound ? 'ping' : 'pulse');
      setTimeout(() => target?.classList.remove('ping', 'pulse'), 500);
    }
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------------------
// Protocol console
// ---------------------------------------------------------------------------
let count = 0;
let total = 0;
const log = $('log');
const kindOf = (type: string) => (type === 'ack' ? 'ack' : type === 'device/hello' || type === 'device/bye' ? 'hello' : type === 'screen/patch' ? 'patch' : 'command');

function summary(m: AnyEnvelope): string {
  const p = m.payload as Record<string, any>;
  switch (m.type) {
    case 'hub/discover': return 'qui est là ?';
    case 'device/hello': return `${p.device?.name ?? m.from} · ${p.state?.screenId ?? 'aucun écran'}`;
    case 'screen/show': return `${p.screen?.id} v${p.screen?.version ?? 1}${p.navigate === false ? '' : ' · navigue'}`;
    case 'screen/patch': return `${p.screenId} → v${p.version} · ${JSON.stringify(p.patch)}`;
    case 'theme/set': return p.theme ? `base: ${p.theme.base}` : 'surcharge retirée';
    case 'display/set': return p.display ? JSON.stringify(p.display) : 'surcharge retirée';
    case 'device/identify': return `${p.durationMs} ms`;
    case 'route/navigate': return p.path;
    case 'ack': return p.ok ? 'ok ✓' : `refusé : ${p.error}`;
    default: return '';
  }
}

listeners.push((m) => {
  count++;
  const size = bytes(m);
  total += size;
  $('m-count').textContent = String(count);
  $('m-bytes').textContent = fmtBytes(total);
  const li = document.createElement('li');
  const to = m.to === undefined ? 'tous' : Array.isArray(m.to) ? m.to.join(',') : m.to;
  const time = new Date(m.ts);
  li.innerHTML = `<span class="t"></span><span class="dir"></span><span class="type"></span><span class="sum"></span><span class="size"></span>`;
  li.querySelector('.t')!.textContent = `${time.toLocaleTimeString('fr-FR')}.${String(time.getMilliseconds()).padStart(3, '0')}`;
  li.querySelector('.dir')!.textContent = `${m.from} → ${to}`;
  const type = li.querySelector<HTMLElement>('.type')!;
  type.textContent = m.type;
  type.dataset.kind = kindOf(m.type);
  const sum = li.querySelector<HTMLElement>('.sum')!;
  sum.textContent = summary(m);
  if (m.type === 'ack' && !(m.payload as { ok: boolean }).ok) sum.classList.add('err');
  li.querySelector('.size')!.textContent = fmtBytes(size);
  log.prepend(li);
  while (log.children.length > 9) log.lastElementChild!.remove();

  // Animate along the wires.
  if (m.from === 'hub') {
    const ids = m.to === undefined || !hub ? [...devices.keys()] : hub.resolveTarget(m.to as Target);
    for (const id of ids.length ? ids : m.to === undefined ? [...devices.keys()] : []) packet(id, true, kindOf(m.type));
  } else if (devices.has(m.from)) {
    packet(m.from, false, kindOf(m.type));
  }

  if (m.type === 'screen/patch') {
    const p = m.payload as { screenId: string };
    const full = bytes({ ...m, type: 'screen/show', payload: { screen: hub?.store.get(p.screenId), navigate: false } });
    $('m-patch').textContent = fmtBytes(size);
    $('m-full').textContent = fmtBytes(full);
    showPatch(m, size, full);
  }
});

// Everything is created once the console listens, so the first messages are shown too.
createDevices();
hub = createScreenHub({ transport: tap(bus.connect()), id: 'hub', store: createScreenStore({ screens }), ackTimeoutMs: 1500 });
requestAnimationFrame(drawWires);

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
let currentScreen = 'ventes';
let currentTarget: Target = 'tv';

function chipGroup(container: HTMLElement, items: { value: string; label: string; dot?: boolean }[], initial: string, onPick: (value: string) => void) {
  container.replaceChildren();
  for (const item of items) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.value = item.value;
    chip.setAttribute('aria-pressed', String(item.value === initial));
    chip.innerHTML = item.dot ? '<span class="dot on"></span>' : '';
    chip.append(item.label);
    chip.onclick = () => {
      for (const c of container.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c === chip));
      onPick(item.value);
    };
    container.append(chip);
  }
}

chipGroup($('screen-chips'), screens.map((s) => ({ value: s.id, label: s.title ?? s.id })), currentScreen, (v) => (currentScreen = v));
chipGroup(
  $('target-chips'),
  [
    { value: 'tv', label: 'TV', dot: true },
    { value: 'borne', label: 'Borne', dot: true },
    { value: 'tablette', label: 'Tablette', dot: true },
    { value: 'tag:hall', label: '#hall' },
    { value: '*', label: 'Tous' },
  ],
  'tv',
  (v) => {
    currentTarget = v;
    syncDisplayChips();
  },
);

$('send').onclick = () => {
  stopTour();
  void hub.show(currentTarget, currentScreen);
};

// Live update: a merge patch touching one panel's params.
let caValue = 128400;
let pending: ReturnType<typeof setTimeout> | undefined;
function setRevenue(value: number) {
  caValue = value;
  ($('ca') as HTMLInputElement).value = String(value);
  $('ca-out').textContent = euros(value);
  return hub.update('ventes', { layout: { panels: { ca: { params: { value } } } } });
}
$('ca').addEventListener('input', () => {
  stopTour();
  const value = Number(($('ca') as HTMLInputElement).value);
  $('ca-out').textContent = euros(value);
  clearTimeout(pending);
  pending = setTimeout(() => void setRevenue(value), 90);
});

const themes: { base: string | null; label: string; bg: string; accent: string }[] = [
  { base: null, label: 'Thème de l’écran', bg: 'linear-gradient(135deg,#0d1117 50%,#f6f8fa 50%)', accent: '' },
  { base: 'dark', label: 'dark', bg: '#1e1e1e', accent: '#007acc' },
  { base: 'abyss', label: 'abyss', bg: '#000c18', accent: '#2277ff' },
  { base: 'dracula', label: 'dracula', bg: '#282a36', accent: '#bd93f9' },
  { base: 'nord', label: 'nord', bg: '#2e3440', accent: '#88c0d0' },
  { base: 'catppuccinMocha', label: 'catppuccinMocha', bg: '#1e1e2e', accent: '#cba6f7' },
  { base: 'githubLight', label: 'githubLight', bg: '#ffffff', accent: '#0969da' },
  { base: 'solarizedLight', label: 'solarizedLight', bg: '#fdf6e3', accent: '#268bd2' },
];
for (const theme of themes) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch';
  b.title = theme.label;
  b.setAttribute('aria-label', theme.label);
  b.setAttribute('aria-pressed', String(theme.base === null));
  b.innerHTML = `<span style="background:${theme.bg}"></span>${theme.accent ? `<span style="inset:auto 0 0 0;height:30%;background:${theme.accent}"></span>` : ''}`;
  b.onclick = () => {
    stopTour();
    for (const s of $('swatches').children) s.setAttribute('aria-pressed', String(s === b));
    void hub.setTheme(currentTarget, theme.base ? { base: theme.base } : null);
  };
  $('swatches').append(b);
}

const displayToggles: { key: keyof DisplaySpec; label: string; on: DisplaySpec }[] = [
  { key: 'hideTabs', label: 'Sans onglets', on: { hideTabs: true } },
  { key: 'locked', label: 'Verrouillé', on: { locked: true } },
  { key: 'rotation', label: 'Rotation 90°', on: { rotation: 90 } },
  { key: 'scale', label: 'Zoom 80 %', on: { scale: 0.8 } },
];
function syncDisplayChips() {
  const first = hub.resolveTarget(currentTarget)[0];
  const display = (first && devices.get(first)?.device.displayOverride) || {};
  for (const chip of $('display-chips').querySelectorAll<HTMLElement>('.chip')) {
    const key = chip.dataset.value as keyof DisplaySpec;
    chip.setAttribute('aria-pressed', String(display[key] !== undefined && display[key] !== false && display[key] !== 0));
  }
}
$('display-chips').replaceChildren(
  ...displayToggles.map((t) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.value = t.key;
    chip.textContent = t.label;
    chip.setAttribute('aria-pressed', 'false');
    chip.onclick = async () => {
      stopTour();
      const on = chip.getAttribute('aria-pressed') !== 'true';
      const off: DisplaySpec = t.key === 'rotation' ? { rotation: 0 } : t.key === 'scale' ? { scale: 1 } : { [t.key]: false };
      await hub.setDisplay(currentTarget, on ? t.on : off, { merge: true });
      syncDisplayChips();
    };
    return chip;
  }),
);
$('identify').onclick = () => {
  stopTour();
  void hub.identify(currentTarget, 1800);
};
$('reset').onclick = async () => {
  stopTour();
  await Promise.all([hub.setTheme('*', null), hub.setDisplay('*', null)]);
  for (const s of $('swatches').children) s.setAttribute('aria-pressed', String(s === $('swatches').firstElementChild));
  syncDisplayChips();
};
for (const id of ['send', 'identify', 'reset']) $(id).addEventListener('pointerdown', stopTour);

// ---------------------------------------------------------------------------
// Guided tour
// ---------------------------------------------------------------------------
let tourToken = 0;
const sleep = (ms: number, token: number) =>
  new Promise<void>((resolve, reject) => setTimeout(() => (token === tourToken ? resolve() : reject(new Error('stopped'))), reduceMotion ? Math.min(ms, 600) : ms));

function caption(step: number, text: string, code: string) {
  $('caption-step').textContent = String(step).padStart(2, '0');
  $('caption-text').textContent = text;
  $('caption-code').textContent = code;
  const el = $('caption');
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function stopTour() {
  if (!tourRunning) return;
  tourToken++;
  tourRunning = false;
  $('tour-toggle').textContent = '▶ Visite guidée';
  caption(0, 'À vous : la régie est à gauche. Chaque action passe par le protocole ci-dessous.', "await hub.show(cible, écran)");
}

let tourRunning = false;
async function runTour() {
  const token = ++tourToken;
  tourRunning = true;
  $('tour-toggle').textContent = '❚❚ Visite guidée';
  try {
    caption(1, 'Trois appareils rejoignent le bus et s’annoncent à la régie.', "createScreenDevice({ transport, info: { name: 'TV Hall', tags: ['hall'] } })");
    await Promise.all([hub.setTheme('*', null), hub.setDisplay('*', null)]);
    hub.discover();
    await sleep(2200, token);
    caption(2, 'La régie envoie l’écran « Ventes » à la TV : stocké, routé, affiché.', "await hub.show('tv', 'ventes')");
    await hub.show('tv', 'ventes');
    await sleep(2000, token);
    caption(3, 'Chaque appareil reçoit sa composition. La route est créée sur l’appareil.', "await hub.show('borne', 'accueil'); await hub.show('tag:bureau', 'operations', { params: { site: 'lyon' } })");
    await hub.show('borne', 'accueil');
    await sleep(500, token);
    await hub.show('tag:bureau', 'operations', { params: { site: 'lyon' } });
    await sleep(2200, token);
    caption(4, 'Mise à jour en direct : un patch de quelques dizaines d’octets, le panneau n’est pas recréé.', "await hub.update('ventes', { layout: { panels: { ca: { params: { value } } } } })");
    for (const value of [131900, 138250, 146700, 152300]) {
      await setRevenue(value);
      await sleep(900, token);
    }
    caption(5, 'Thème à distance, appliqué par étiquette, sans modifier l’écran.', "await hub.setTheme('tag:hall', { base: 'dracula' })");
    await hub.setTheme('tag:hall', { base: 'dracula' });
    await sleep(2000, token);
    caption(6, 'Affichage : onglets masqués et disposition verrouillée sur la TV.', "await hub.setDisplay('tv', { hideTabs: true, locked: true }, { merge: true })");
    await hub.setDisplay('tv', { hideTabs: true, locked: true }, { merge: true });
    await sleep(1800, token);
    caption(7, 'Rotation : la borne fait pivoter son contenu de 90°.', "await hub.setDisplay('borne', { rotation: 90 }, { merge: true })");
    await hub.setDisplay('borne', { rotation: 90 }, { merge: true });
    await sleep(2000, token);
    caption(8, 'Identifier : chaque écran affiche son nom pour être repéré.', "await hub.identify('*', 1600)");
    await hub.identify('*', 1600);
    await sleep(2200, token);
    caption(9, 'Les surcharges sont retirées : chaque écran retrouve son propre thème.', "await hub.setTheme('*', null); await hub.setDisplay('*', null)");
    await Promise.all([hub.setTheme('*', null), hub.setDisplay('*', null)]);
    syncDisplayChips();
    await sleep(2400, token);
    tourRunning = false;
    $('tour-toggle').textContent = '↻ Rejouer la visite';
    caption(10, 'À vous : choisissez un écran, une cible, et diffusez. Le protocole s’affiche ci-dessous.', "await hub.show(cible, écran)");
  } catch {
    // Stopped by the user.
  }
}
$('tour-toggle').onclick = () => (tourRunning ? stopTour() : void runTour());
document.querySelector('.rail')!.addEventListener('pointerdown', () => stopTour());

// Start the tour when the studio becomes visible.
const io = new IntersectionObserver((entries) => {
  if (entries.some((e) => e.isIntersecting)) {
    io.disconnect();
    setTimeout(() => void runTour(), 500);
  }
}, { threshold: 0, rootMargin: '0px 0px -8% 0px' });
io.observe($('demo'));

// ---------------------------------------------------------------------------
// Data section: the screen JSON and the last patch, live
// ---------------------------------------------------------------------------
function showScreenJson() {
  const screen = hub.store.get('ventes')!;
  const { layout, ...rest } = screen;
  // Keep the JSON readable: grid geometry is summarised, panels are shown in full.
  const view = { ...rest, layout: { grid: '{ … arbre dockview … }', panels: layout?.panels } };
  $('data-screen').replaceChildren(codeBlock(JSON.stringify(view, null, 2), 'json', 'hub.store.get("ventes")'));
  $('data-version').textContent = `v${screen.version}`;
  $('data-hash').textContent = `#${contentHash(screen)}`;
}
function showPatch(message: AnyEnvelope, size: number, full: number) {
  const block = codeBlock(JSON.stringify(message, null, 2), 'json', `${fmtBytes(size)} au lieu de ${fmtBytes(full)}`);
  block.classList.add('flash-line');
  $('data-patch').replaceChildren(block);
  $('data-size').textContent = `−${Math.round((1 - size / full) * 100)} %`;
}
$('data-patch').replaceChildren(codeBlock('// Bougez le curseur « Chiffre d’affaires » de la démo,\n// ou lancez la visite guidée.', 'ts', 'en attente'));
showScreenJson();
hub.store.subscribe((e) => {
  if (e.type === 'put' && e.screen.id === 'ventes') showScreenJson();
});

// ---------------------------------------------------------------------------
// Router lab
// ---------------------------------------------------------------------------
const router = createScreenRouter({ adapter: memoryRouter('/hall/nord') });
const describeTarget = new Map<string, string>();
function addLabRoute(path: string, screen: string, id?: string) {
  const params = [...screen.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  const remove = router.addRoute(
    params.length
      ? { id: id ?? path, path, resolve: (p) => screen.replace(/\{(\w+)\}/g, (_, k: string) => String(p[k] ?? '')) }
      : { id: id ?? path, path, screenId: screen },
  );
  describeTarget.set(id ?? path, screen);
  return remove;
}
addLabRoute('/accueil', 'accueil');
addLabRoute('/hall/:zone', 'hall-{zone}');
addLabRoute('/mur{/:index}', 'mur');
addLabRoute('/fichiers/*chemin', 'explorateur');
describeTarget.set('multi-screen:screen', '{screenId}');

let lastAdded: string | undefined;
function renderRoutes() {
  const current = router.current;
  $('route-list').replaceChildren(
    ...router.routes().map((r) => {
      const li = document.createElement('li');
      if (current?.route.id === r.id) li.classList.add('hit');
      if (r.id === lastAdded) li.classList.add('new');
      const path = document.createElement('span');
      path.textContent = r.path;
      const target = document.createElement('span');
      target.className = 'target';
      target.textContent = `→ ${describeTarget.get(r.id) ?? r.screenId ?? '?'}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Retirer ${r.path}`);
      remove.onclick = () => {
        router.removeRoute(r.id);
        showCode(`router.removeRoute('${r.id}')`);
      };
      li.append(path, target, remove);
      return li;
    }),
  );
  const match = $('route-match');
  match.className = `match ${current ? 'ok' : 'none'}`;
  if (!current) {
    match.innerHTML = '<span class="k">router.current</span><span class="v">undefined — aucune route ne correspond</span>';
    return;
  }
  match.innerHTML = `<span class="k">route</span><span class="v"></span><span class="k">params</span><span class="v"></span><span class="k">écran</span><span class="v screen"></span>`;
  const values = match.querySelectorAll('.v');
  values[0]!.textContent = current.route.path;
  values[1]!.textContent = JSON.stringify(current.params);
  values[2]!.textContent = current.screenId ?? '—';
}
function showCode(code: string) {
  $('route-code').replaceChildren(codeBlock(code, 'ts'));
}
router.subscribe(() => renderRoutes());
$('route-url').addEventListener('input', () => {
  const value = ($('route-url') as HTMLInputElement).value.trim() || '/';
  router.navigate(value.startsWith('/') ? value : `/${value}`);
  showCode(`router.match('${value}')\n// → ${router.current ? `{ screenId: '${router.current.screenId}', params: ${JSON.stringify(router.current.params)} }` : 'undefined'}`);
});
$('route-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const path = ($('route-path') as HTMLInputElement).value.trim();
  const screen = ($('route-screen') as HTMLInputElement).value.trim();
  try {
    lastAdded = path;
    addLabRoute(path, screen);
    $('route-error').textContent = '';
    const params = [...screen.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
    showCode(
      params.length
        ? `router.addRoute({\n  path: '${path}',\n  resolve: ({ ${params.join(', ')} }) => \`${screen.replace(/\{(\w+)\}/g, '${$1}')}\`,\n})`
        : `router.addRoute({ path: '${path}', screenId: '${screen}' })`,
    );
    ($('route-path') as HTMLInputElement).value = '';
    ($('route-screen') as HTMLInputElement).value = '';
  } catch (error) {
    $('route-error').textContent = (error as Error).message;
  }
});
($('route-path') as HTMLInputElement).placeholder = '/salle/:numero';
($('route-screen') as HTMLInputElement).placeholder = 'salle-{numero}';
renderRoutes();
showCode(`router.match('/hall/nord')\n// → { screenId: 'hall-nord', params: { zone: 'nord' } }`);

// Copy buttons outside code blocks (npm chip).
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) button.onclick = () => copyText(button.dataset.copy!, button);
