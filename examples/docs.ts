import {
  createMemoryBus, createScreenDevice, createScreenHub, createScreenRouter, createScreenStore, createShareUrl, decodeScreen,
  memoryRouter, validateScreen, type DisplaySpec, type ScreenDefinition,
} from 'multi-screen';
import { createScreenEditor, createScreenManager, createScreenOutlet, editorLabelsFr, managerLabelsFr, mountScreen, themeNames } from 'multi-screen/dockview';
import { createDemoRegistry } from './shared';
import { enhanceCode, mountLogo } from './site';

mountLogo();
enhanceCode();

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: (Node | string)[]) => {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
};
const button = (label: string, onClick: () => void, primary = false) => {
  const b = h('button', { type: 'button', className: `btn btn-sm${primary ? ' btn-primary' : ''}` }, label);
  b.onclick = onClick;
  return b;
};
const registry = createDemoRegistry();

// ---------------------------------------------------------------------------
// Table of contents with scroll spy and filter
// ---------------------------------------------------------------------------
const toc = $('toc');
const links = new Map<Element, HTMLAnchorElement>();
for (const section of document.querySelectorAll<HTMLElement>('#content > section')) {
  const title = section.querySelector('h2, h1');
  if (!title) continue;
  const a = h('a', { href: `#${section.id}` }, section.id === 'introduction' ? 'Introduction' : title.textContent ?? '');
  toc.append(a);
  links.set(section, a);
  section.querySelectorAll('h3').forEach((h3, i) => {
    h3.id ||= `${section.id}-${i + 1}`;
    toc.append(h('a', { href: `#${h3.id}`, className: 'sub' }, h3.textContent ?? ''));
  });
}
const spy = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const a of links.values()) a.classList.remove('active');
      links.get(entry.target)?.classList.add('active');
    }
  },
  { rootMargin: '-80px 0px -70% 0px' },
);
for (const section of links.keys()) spy.observe(section);
$('toc-filter').addEventListener('input', (e) => {
  const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
  for (const a of toc.querySelectorAll<HTMLAnchorElement>('a')) a.hidden = !!q && !a.textContent!.toLowerCase().includes(q);
});

// ---------------------------------------------------------------------------
// Quick start: a hub and a device on an in-page bus
// ---------------------------------------------------------------------------
{
  const bus = createMemoryBus();
  const hub = createScreenHub({ transport: bus.connect(), id: 'regie', ackTimeoutMs: 1000 });
  const device = createScreenDevice({ transport: bus.connect(), info: { id: 'hall', name: 'Hall d’accueil', tags: ['hall'] }, router: createScreenRouter(), heartbeatMs: 0 });
  hub.store.put({
    id: 'accueil',
    title: 'Accueil',
    route: '/accueil',
    theme: { base: 'abyss' },
    display: { hideTabs: true },
    panels: [
      { id: 'titre', component: 'ms:text', params: { text: 'Bienvenue', size: '2.4em' } },
      { id: 'heure', component: 'ms:clock', params: { timeZone: 'Europe/Paris' }, position: { referencePanel: 'titre', direction: 'below' } },
    ],
  });
  const view = h('div', { className: 'live-view' });
  const log = h('ol', { className: 'mini-log' });
  const write = (text: string, cls = '') => {
    const li = h('li', { className: cls });
    li.innerHTML = text;
    log.prepend(li);
  };
  const run = async (label: string, action: () => Promise<{ acks: { ok: boolean }[]; missing: string[] }>) => {
    write(`<b>${label}</b>`);
    const result = await action();
    write(`→ ${result.acks.filter((a) => a.ok).length} accusé(s) ok, ${result.missing.length} sans réponse`, 'ack');
  };
  const controls = h(
    'div',
    { className: 'row' },
    button("hub.show('tag:hall', 'accueil')", () => void run("hub.show('tag:hall', 'accueil')", () => hub.show('tag:hall', 'accueil')), true),
    button('hub.update(…)', () => void run("hub.update('accueil', { … 'Bonjour' })", async () => (await hub.update('accueil', { panels: [{ id: 'titre', component: 'ms:text', params: { text: 'Bonjour !', size: '2.4em' } }, { id: 'heure', component: 'ms:clock', params: { timeZone: 'Europe/Paris' }, position: { referencePanel: 'titre', direction: 'below' } }] }))[0] ?? { acks: [], missing: [] })),
    button("setTheme('dracula')", () => void run("hub.setTheme('hall', { base: 'dracula' })", () => hub.setTheme('hall', { base: 'dracula' }))),
    button('identify', () => void run("hub.identify('hall')", () => hub.identify('hall', 1500))),
    button('réinitialiser', () => void run("hub.setTheme('*', null)", () => hub.setTheme('*', null))),
  );
  $('live-quick').append(h('div', { className: 'live-body' }, view, controls, log));
  createScreenOutlet(view, { registry, router: device.router, device, empty: (el) => (el.textContent = 'L’appareil attend un écran…') });
}

// ---------------------------------------------------------------------------
// Sandbox: edit JSON, validate, render
// ---------------------------------------------------------------------------
let sandboxScreen: ScreenDefinition = {
  id: 'bac-a-sable',
  title: 'Bac à sable',
  theme: { base: 'githubDark' },
  panels: [
    { id: 'ca', component: 'demo:kpi', title: "Chiffre d'affaires", params: { label: "Chiffre d'affaires", value: 128400, unit: '€', trend: 4.2 } },
    { id: 'flux', component: 'demo:line', title: 'Fréquentation', params: { title: 'Fréquentation', values: [12, 18, 15, 24, 30, 27, 35], unit: 'pers.' }, position: { referencePanel: 'ca', direction: 'right' } },
    { id: 'etat', component: 'demo:status', title: 'État', params: { title: 'Lignes', rows: [{ label: 'Ligne A', state: 'ok', detail: 'Nominal' }, { label: 'Ligne B', state: 'warn', detail: '+4 min' }] }, position: { referencePanel: 'ca', direction: 'below' } },
  ],
};
const sandboxListeners: ((screen: ScreenDefinition) => void)[] = [];
{
  const area = h('textarea', { className: 'json', spellcheck: false, value: JSON.stringify(sandboxScreen, null, 2) });
  area.setAttribute('aria-label', 'Définition JSON de l’écran');
  const viewHost = h('div', { className: 'live-view' });
  const status = h('div', { className: 'status-line ok' }, '✓ écran valide');
  $('live-sandbox').append(h('div', { className: 'live-body live-split' }, h('div', {}, area, status), viewHost));
  const view = mountScreen(viewHost, { registry, screen: sandboxScreen });
  let timer: ReturnType<typeof setTimeout> | undefined;
  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const screen = validateScreen(JSON.parse(area.value));
        view.render(screen);
        sandboxScreen = screen;
        sandboxListeners.forEach((l) => l(screen));
        status.className = 'status-line ok';
        status.textContent = `✓ écran valide · ${screen.panels?.length ?? 0} panneau(x)`;
      } catch (error) {
        status.className = 'status-line err';
        status.textContent = `✗ ${(error as Error).message}`;
      }
    }, 250);
  });
}

// ---------------------------------------------------------------------------
// Display overrides
// ---------------------------------------------------------------------------
{
  const viewHost = h('div', { className: 'live-view' });
  const view = mountScreen(viewHost, { registry, screen: sandboxScreen });
  sandboxListeners.push((s) => view.render(s));
  const code = h('div', { className: 'result' }, 'view.setDisplay(undefined)');
  let display: DisplaySpec = {};
  const apply = (change: DisplaySpec | null) => {
    display = change ? { ...display, ...change } : {};
    view.setDisplay(display);
    code.textContent = `view.setDisplay(${JSON.stringify(display)})`;
  };
  $('live-display').append(
    h(
      'div',
      { className: 'live-body' },
      viewHost,
      h(
        'div',
        { className: 'row' },
        button('1920 × 1080 virtuel', () => apply({ resolution: { width: 1920, height: 1080 }, fit: 'contain' })),
        button('Rotation 90°', () => apply({ rotation: display.rotation === 90 ? 0 : 90 })),
        button('Zoom 75 %', () => apply({ scale: display.scale === 0.75 ? 1 : 0.75 })),
        button('Sans onglets', () => apply({ hideTabs: !display.hideTabs })),
        button('Verrouillé', () => apply({ locked: !display.locked })),
        button('Fond', () => apply({ background: display.background ? undefined : '#2f6fde' })),
        button('Réinitialiser', () => apply(null)),
      ),
      code,
    ),
  );
}

// ---------------------------------------------------------------------------
// Share link
// ---------------------------------------------------------------------------
{
  const result = h('div', { className: 'result' }, 'Cliquez pour encoder l’écran du bac à sable.');
  const open = h('a', { className: 'btn btn-sm', target: '_blank', rel: 'noopener' }, 'Ouvrir sur un appareil ↗');
  open.hidden = true;
  const make = async () => {
    const url = await createShareUrl(sandboxScreen, { baseUrl: new URL('./device.html', location.href).toString() });
    const payload = url.split('#/share/')[1]!;
    const decoded = await decodeScreen(payload);
    const json = JSON.stringify(sandboxScreen).length;
    result.innerHTML = '';
    result.append(
      `${url.slice(0, 120)}…\n\n`,
      `JSON : ${json} caractères → lien : ${payload.length} caractères (${payload.startsWith('z.') ? 'compressé deflate-raw' : 'non compressé'})\n`,
      Object.assign(document.createElement('span'), { className: 'hit', textContent: `decodeScreen(…) → « ${decoded.title} », ${decoded.panels?.length ?? 0} panneaux ✓` }),
    );
    open.href = url;
    open.hidden = false;
  };
  $('live-share').append(h('div', { className: 'live-body' }, h('div', { className: 'row' }, button('createShareUrl(écran)', () => void make(), true), open), result));
}

// ---------------------------------------------------------------------------
// Router tester
// ---------------------------------------------------------------------------
{
  const router = createScreenRouter({ adapter: memoryRouter('/') });
  router.addRoute({ path: '/accueil', screenId: 'accueil' });
  router.addRoute({ path: '/hall/:zone', resolve: ({ zone }) => `hall-${zone}` });
  router.addRoute({ path: '/mur{/:index}', screenId: 'mur' });
  router.addRoute({ path: '/fichiers/*chemin', screenId: 'explorateur' });
  const input = h('input', { className: 'path', value: '/hall/nord' });
  input.setAttribute('aria-label', 'Chemin à tester');
  const result = h('div', { className: 'result' });
  const routes = h('div', { className: 'result' }, router.routes().map((r, i) => `${String(i + 1).padStart(2, '0')}  ${r.path}`).join('\n'));
  const test = () => {
    const match = router.match(input.value.trim() || '/');
    result.innerHTML = '';
    if (!match) result.append('router.match(…) → undefined');
    else {
      result.append(`router.match('${input.value}')\n→ route   ${match.route.path}\n→ params  ${JSON.stringify(match.params)}\n→ `);
      result.append(Object.assign(document.createElement('span'), { className: 'hit', textContent: `screenId '${match.screenId}'` }));
    }
  };
  input.addEventListener('input', test);
  const examples = ['/accueil', '/hall/nord', '/mur', '/mur/3', '/fichiers/a/b/c.pdf', '/screens/promo', '/inconnu'].map((p) =>
    button(p, () => {
      input.value = p;
      test();
    }),
  );
  $('live-router').append(h('div', { className: 'live-body' }, h('div', { className: 'row' }, input), h('div', { className: 'row' }, ...examples), result, routes));
  test();
}

// ---------------------------------------------------------------------------
// Themes available
// ---------------------------------------------------------------------------
$('theme-list').append(...themeNames().map((name) => h('code', {}, name)));

// ---------------------------------------------------------------------------
// Editor and manager sharing one store
// ---------------------------------------------------------------------------
{
  const store = createScreenStore({ screens: [sandboxScreen, { id: 'accueil', title: 'Accueil', theme: { base: 'abyss' }, panels: [{ id: 'titre', component: 'ms:text', params: { text: 'Bienvenue', size: '2.4em' } }, { id: 'heure', component: 'ms:clock', position: { referencePanel: 'titre', direction: 'below' } }] }] });
  const editorHost = h('div', { className: 'live-editor-host' });
  const managerHost = h('div', { className: 'live-manager-host' });
  $('live-editor').append(editorHost);
  $('live-manager').append(managerHost);
  let started = false;
  // Mounted when scrolled into view: keeps the page light.
  new IntersectionObserver((entries, observer) => {
    if (started || !entries.some((e) => e.isIntersecting)) return;
    started = true;
    observer.disconnect();
    const editor = createScreenEditor(editorHost, { registry, store, labels: editorLabelsFr, screenId: 'bac-a-sable' });
    createScreenManager(managerHost, {
      store,
      registry,
      labels: managerLabelsFr,
      locale: 'fr-FR',
      onEdit: (id) => {
        editor.open(id);
        $('live-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    });
  }, { rootMargin: '300px' }).observe($('live-editor'));
}
