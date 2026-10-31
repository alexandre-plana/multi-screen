#!/usr/bin/env node
/*
 * Données du film, produites par la bibliothèque elle-même (dist/, après `npm run build`).
 *
 *   node motion/data.mjs   → motion/data.js (window.MS_DATA)
 *
 * Tout ce que le film affiche comme JSON, messages, patch, empreintes, routes et lien de
 * partage vient d'ici : la composition est montée dans dockview (jsdom), sérialisée par
 * `view.toScreen()`, stockée dans un ScreenStore, envoyée par un ScreenHub à trois
 * ScreenDevice reliés par un bus mémoire, mise à jour par `hub.update`, puis transformée
 * en lien par `createShareUrl`. Le QR code est calculé par `segno` (Python), s'il est installé.
 */
import { JSDOM } from 'jsdom';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const dist = (p) => path.join(ROOT, 'dist', p);
if (!fs.existsSync(dist('core/index.js'))) {
  console.error('dist/ introuvable : lancez d’abord `npm run build`.');
  process.exit(1);
}

// ── Un DOM minimal pour dockview ──
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'DragEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DocumentFragment', 'MutationObserver']) {
  if (!(key in globalThis) || key === 'window' || key === 'document') {
    Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : dom.window[key], configurable: true, writable: true });
  }
}
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const core = await import(dist('core/index.js'));
const dv = await import(dist('dockview/index.js'));
const { createScreenStore, createScreenHub, createScreenDevice, createScreenRouter, memoryRouter, createMemoryBus, contentHash, createShareUrl, validateScreen } = core;
const { createPanelRegistry, registerBuiltinPanels, builtinPanelLabelsFr, mountScreen } = dv;

// Les deux panneaux de démonstration de examples/shared.ts (rendu simplifié : seuls les paramètres comptent ici).
const registry = registerBuiltinPanels(createPanelRegistry(), { labels: builtinPanelLabelsFr })
  .register('demo:kpi', ({ element, params }) => { element.textContent = String(params.value); return { update: (p) => (element.textContent = String(p.value)) }; },
    { label: 'Indicateur', defaults: { label: 'Indicateur', value: 1200, unit: '€', trend: 3.5 } })
  .register('demo:bars', ({ element }) => { element.textContent = 'bars'; }, { label: 'Histogramme', defaults: { title: 'Histogramme', values: [4, 8, 6, 10, 7], labels: ['L', 'M', 'M', 'J', 'V'] } });

// ── 01 Composer : la composition de l'éditeur ──
// Texte, puis Indicateur déposé sur le bord droit, puis Horloge déposée en bas du groupe Texte.
const composed = {
  id: 'accueil',
  title: 'Accueil',
  route: '/accueil',
  theme: { base: 'light' },
  panels: [
    { id: 'ms-text-1', component: 'ms:text', title: 'Texte', params: { text: 'Bienvenue au salon' } },
    { id: 'demo-kpi-1', component: 'demo:kpi', title: 'Indicateur', params: { label: 'Indicateur', value: 128400, unit: '€', trend: 3.5 }, position: { referencePanel: 'ms-text-1', direction: 'right' } },
    { id: 'ms-clock-1', component: 'ms:clock', title: 'Horloge', params: { timeZone: 'Europe/Paris' }, position: { referencePanel: 'ms-text-1', direction: 'below' } },
  ],
};
const host = document.createElement('div');
document.body.append(host);
const view = mountScreen(host, { registry, screen: composed });
view.api.layout(1920, 1080, true);
const exact = view.toScreen(); // ce qu'enregistre l'éditeur : la disposition exacte
view.dispose();
// Aller-retour JSON, comme entre l'éditeur et la régie (webStorage) : les champs `undefined` de dockview disparaissent.
const saved = validateScreen(JSON.parse(JSON.stringify({ id: exact.id, title: exact.title, route: exact.route, layout: exact.layout, theme: exact.theme })));

// ── 02 L'écran est une donnée : store versionné, empreintes ──
const store = createScreenStore();
const v1 = store.put(saved);
const v2 = store.put({ ...v1, display: { cursor: 'none' } }); // « Masquer le curseur sur les écrans »

// ── 04 Diffuser : régie, trois appareils, bus mémoire, messages réels ──
const bus = createMemoryBus();
const wire = [];
const tap = bus.connect();
tap.subscribe((m) => wire.push(structuredClone(m)));
const devices = [
  { id: 'hall-tv', name: 'Hall', tags: ['hall'], viewport: { width: 1920, height: 1080 } },
  { id: 'borne', name: 'Borne d’accueil', tags: ['hall'], viewport: { width: 1080, height: 1920 } },
  { id: 'bureau', name: 'Bureau', tags: ['bureau'], viewport: { width: 1280, height: 800 } },
].map((info) => createScreenDevice({ transport: bus.connect(), router: createScreenRouter({ adapter: memoryRouter() }), info }));
const hub = createScreenHub({ transport: bus.connect(), store });
const settle = () => new Promise((r) => setTimeout(r, 30));
await settle();
const show = await hub.show('tag:hall', 'accueil');
await settle();
const update = await hub.update('accueil', (s) => {
  const next = structuredClone(s);
  next.layout.panels['demo-kpi-1'].params.value = 131900;
  return next;
});
await settle();
// 05 Régler l'affichage : la séquence du film, dans le même ordre.
const display = await hub.setDisplay('borne', { rotation: 90, resolution: { width: 1080, height: 1920 } });
await hub.setTheme('borne', { base: 'abyss' });
const theme = await hub.setTheme('borne', { base: 'dracula' });
await hub.setDisplay('borne', { hideTabs: true, locked: true }, { merge: true });
await hub.identify('borne');
await settle();
const types = wire.map((m) => m.type);
const patchMsg = wire.find((m) => m.type === 'screen/patch');
const showMsg = wire.find((m) => m.type === 'screen/show');
const deviceView = devices.map((d) => ({ id: d.info.id, name: d.info.name, tags: d.info.tags, path: d.router.current?.location.pathname ?? null, screenId: d.router.current?.screenId ?? null }));

// ── 03 Routes dynamiques : le routeur réel ──
const adapterA = memoryRouter('/mur/gauche');
const adapterB = memoryRouter('/mur/droite');
const routerA = createScreenRouter({ adapter: adapterA });
const routerB = createScreenRouter({ adapter: adapterB });
const routes = [
  { path: '/accueil', screenId: 'accueil' },
  { path: '/tableaux/ventes', screenId: 'ventes' },
  { path: '/mur/:position', screenId: 'mur' },
];
const removers = routes.map((r) => [routerA.addRoute(r), routerB.addRoute(r)]);
const matchA = routerA.current, matchB = routerB.current;
const table = routerA.routes().map((r) => ({ id: r.id, path: r.path, screenId: r.screenId ?? null, priority: r.priority ?? 0 }));
removers[2].forEach((remove) => remove());
const afterA = routerA.current, afterB = routerB.current;

// ── 06 Partout : lien de partage et QR code ──
const shareScreen = store.get('accueil');
const shareUrl = await createShareUrl(shareScreen, { baseUrl: 'https://ecrans.example.com/device.html' });
let qr = null;
const py = spawnSync('python3', ['-c', 'import sys, segno; q = segno.make(sys.argv[1], error="l", micro=False); print(q.version); [print("".join("1" if c else "0" for c in row)) for row in q.matrix]', shareUrl], { encoding: 'utf8' });
if (py.status === 0) {
  const [version, ...rows] = py.stdout.trim().split('\n');
  qr = { version: Number(version), rows };
} else console.warn('segno indisponible : le QR code sera remplacé par un motif (pip install segno).');

// ── Mise en forme du JSON pour l'écran ──
const panelsOf = (s) => Object.values(s.layout.panels).map((p) => ({ id: p.id, contentComponent: p.contentComponent, title: p.title, params: p.params }));
const data = {
  generatedBy: 'motion/data.mjs',
  screen: { id: v2.id, title: v2.title, route: v2.route, theme: v2.theme, display: v2.display, layoutKeys: Object.keys(v2.layout), gridOrientation: v2.layout.grid.orientation, panels: panelsOf(v2) },
  versions: [
    { version: v1.version, hash: contentHash(v1) },
    { version: v2.version, hash: contentHash(v2) },
  ],
  wire: {
    types,
    show: { type: showMsg.type, to: showMsg.to, screenId: showMsg.payload.screen.id, version: showMsg.payload.screen.version },
    patch: { type: patchMsg.type, to: patchMsg.to, payload: patchMsg.payload },
  },
  results: Object.fromEntries(Object.entries({ show, update, theme, display }).map(([k, r]) => [k, [r].flat().map((x) => ({ expected: x.expected, acks: x.acks.map((a) => ({ from: a.from, ok: a.ok })), ok: x.ok }))])),
  devices: deviceView,
  borne: { display: devices[1].displayOverride, theme: devices[1].themeOverride },
  bytes: { patch: JSON.stringify(patchMsg.payload.patch).length, screen: JSON.stringify(store.get('accueil')).length },
  router: {
    table,
    before: [matchA, matchB].map((m) => ({ path: m?.location.pathname, screenId: m?.screenId ?? null, params: m?.params ?? null })),
    after: [afterA, afterB].map((m) => ({ screenId: m?.screenId ?? null })),
  },
  share: { url: shareUrl, length: shareUrl.length, qr },
};
fs.writeFileSync(path.join(HERE, 'data.js'), `/* Généré par motion/data.mjs — ne pas modifier à la main. */\nwindow.MS_DATA = ${JSON.stringify(data, null, 1)};\n`);
console.log(JSON.stringify({ borne: data.borne, bytes: data.bytes, types, versions: data.versions, patch: data.wire.patch, results: data.results, devices: deviceView, router: data.router, shareLength: shareUrl.length, qr: qr && qr.version }, null, 1));
process.exit(0);
