import 'dockview/dist/styles/dockview.css';
import './panels.css';
import { broadcastChannelTransport, webSocketTransport, type ScreenDefinition, type Transport } from 'multi-screen';
import { builtinPanelLabelsFr, createPanelRegistry, registerBuiltinPanels, type PanelFactory } from 'multi-screen/dockview';

/**
 * Transport chosen from the URL: `?relay=ws://localhost:8787` goes through
 * the WebSocket relay (other machines), otherwise BroadcastChannel (other
 * tabs and windows of this browser).
 */
export function transportFromUrl(): { transport: Transport; label: string } {
  const params = new URLSearchParams(location.search);
  const relay = params.get('relay');
  if (relay) {
    const room = params.get('room') ?? 'demo';
    const url = `${relay}${relay.includes('?') ? '&' : '?'}room=${encodeURIComponent(room)}`;
    return { transport: webSocketTransport({ url }), label: `WebSocket ${relay} (salle ${room})` };
  }
  return { transport: broadcastChannelTransport('multi-screen-demo'), label: 'BroadcastChannel (même navigateur)' };
}

/** A KPI tile: `{ label, value, unit?, trend? }`. */
const kpi: PanelFactory<{ label?: string; value?: number; unit?: string; trend?: number }> = ({ element, params }) => {
  element.innerHTML = '<div class="kpi"><div class="kpi-label"></div><div class="kpi-value"></div><div class="kpi-trend"></div></div>';
  const label = element.querySelector<HTMLElement>('.kpi-label')!;
  const value = element.querySelector<HTMLElement>('.kpi-value')!;
  const trend = element.querySelector<HTMLElement>('.kpi-trend')!;
  const apply = (p: typeof params) => {
    label.textContent = p.label ?? '';
    value.textContent = `${(p.value ?? 0).toLocaleString('fr-FR')}${p.unit ? ` ${p.unit}` : ''}`;
    trend.textContent = p.trend === undefined ? '' : `${p.trend >= 0 ? '▲' : '▼'} ${Math.abs(p.trend)} %`;
    trend.dataset.dir = (p.trend ?? 0) >= 0 ? 'up' : 'down';
  };
  apply(params);
  return { update: apply };
};

/** A bar chart in plain SVG: `{ title, values: number[], labels?: string[] }`. */
const bars: PanelFactory<{ title?: string; values?: number[]; labels?: string[] }> = ({ element, params }) => {
  const ns = 'http://www.w3.org/2000/svg';
  const wrap = document.createElement('div');
  wrap.className = 'bars';
  const title = document.createElement('div');
  title.className = 'bars-title';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 60');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  wrap.append(title, svg);
  element.append(wrap);
  const apply = (p: typeof params) => {
    const values = p.values ?? [];
    title.textContent = p.title ?? '';
    svg.setAttribute('aria-label', `${p.title ?? 'Graphique'} : ${values.join(', ')}`);
    svg.replaceChildren();
    const max = Math.max(1, ...values);
    const w = 100 / Math.max(1, values.length);
    values.forEach((v, i) => {
      const rect = document.createElementNS(ns, 'rect');
      const h = (v / max) * 56;
      rect.setAttribute('x', String(i * w + w * 0.15));
      rect.setAttribute('width', String(w * 0.7));
      rect.setAttribute('y', String(60 - h));
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '1');
      svg.append(rect);
    });
  };
  apply(params);
  return { update: apply };
};

/** A status board: `{ title, rows: [{ label, state: 'ok' | 'warn' | 'down', detail }] }`. */
type StatusRow = { label: string; state: 'ok' | 'warn' | 'down'; detail?: string };
const status: PanelFactory<{ title?: string; rows?: StatusRow[] }> = ({ element, params }) => {
  const wrap = document.createElement('div');
  wrap.className = 'status-board';
  element.append(wrap);
  const apply = (p: typeof params) => {
    wrap.replaceChildren();
    const title = document.createElement('div');
    title.className = 'status-title';
    title.textContent = p.title ?? '';
    wrap.append(title);
    for (const row of p.rows ?? []) {
      const line = document.createElement('div');
      line.className = 'status-row';
      line.dataset.state = row.state;
      const dot = document.createElement('i');
      const label = document.createElement('span');
      label.textContent = row.label;
      const detail = document.createElement('em');
      detail.textContent = row.detail ?? '';
      line.append(dot, label, detail);
      wrap.append(line);
    }
  };
  apply(params);
  return { update: apply };
};

/** A line chart in SVG: `{ title, values: number[], unit? }`. */
const line: PanelFactory<{ title?: string; values?: number[]; unit?: string }> = ({ element, params }) => {
  const ns = 'http://www.w3.org/2000/svg';
  const wrap = document.createElement('div');
  wrap.className = 'line-chart';
  const head = document.createElement('div');
  head.className = 'line-head';
  const title = document.createElement('span');
  const last = document.createElement('b');
  head.append(title, last);
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 40');
  svg.setAttribute('preserveAspectRatio', 'none');
  const area = document.createElementNS(ns, 'path');
  area.setAttribute('class', 'line-area');
  const stroke = document.createElementNS(ns, 'path');
  stroke.setAttribute('class', 'line-stroke');
  stroke.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(area, stroke);
  wrap.append(head, svg);
  element.append(wrap);
  const apply = (p: typeof params) => {
    const values = p.values ?? [];
    title.textContent = p.title ?? '';
    last.textContent = values.length ? `${values.at(-1)!.toLocaleString('fr-FR')}${p.unit ? ` ${p.unit}` : ''}` : '';
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * 100, 38 - ((v - min) / (max - min || 1)) * 34] as const);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    stroke.setAttribute('d', d);
    area.setAttribute('d', pts.length ? `${d} L100,40 L0,40 Z` : '');
    svg.setAttribute('aria-label', `${p.title ?? 'Courbe'} : ${values.join(', ')}`);
    svg.setAttribute('role', 'img');
  };
  apply(params);
  return { update: apply };
};

export function createDemoRegistry() {
  return registerBuiltinPanels(createPanelRegistry(), { labels: builtinPanelLabelsFr })
    .register('demo:kpi', kpi, { label: 'Indicateur', defaults: { label: 'Indicateur', value: 1200, unit: '€', trend: 3.5 } })
    .register('demo:bars', bars, { label: 'Histogramme', defaults: { title: 'Histogramme', values: [4, 8, 6, 10, 7], labels: ['L', 'M', 'M', 'J', 'V'] } })
    .register('demo:status', status, {
      label: 'Tableau d’état',
      defaults: { title: 'État des lignes', rows: [{ label: 'Ligne A', state: 'ok', detail: 'Nominal' }, { label: 'Ligne B', state: 'warn', detail: 'Retard 4 min' }] },
    })
    .register('demo:line', line, { label: 'Courbe', defaults: { title: 'Fréquentation', values: [12, 18, 15, 24, 30, 27, 35], unit: 'pers.' } });
}

export const presets: ScreenDefinition[] = [
  {
    id: 'accueil',
    title: 'Accueil',
    route: '/accueil',
    theme: { base: 'abyss' },
    display: { hideTabs: true, cursor: 'none' },
    panels: [
      { id: 'bienvenue', component: 'ms:text', title: 'Bienvenue', params: { text: 'Bienvenue au salon', size: '3.5em' } },
      { id: 'horloge', component: 'ms:clock', title: 'Heure', params: { timeZone: 'Europe/Paris' }, position: { referencePanel: 'bienvenue', direction: 'below' }, initialHeight: 160 },
    ],
  },
  {
    id: 'ventes',
    title: 'Tableau des ventes',
    route: '/tableaux/ventes',
    theme: { base: 'githubDark' },
    panels: [
      { id: 'ca', component: 'demo:kpi', title: "Chiffre d'affaires", params: { label: "Chiffre d'affaires", value: 128400, unit: '€', trend: 4.2 } },
      { id: 'commandes', component: 'demo:kpi', title: 'Commandes', params: { label: 'Commandes', value: 342, trend: -1.5 }, position: { referencePanel: 'ca', direction: 'right' } },
      { id: 'semaine', component: 'demo:bars', title: 'Semaine', params: { title: 'Ventes par jour', values: [12, 18, 9, 22, 30, 26, 14], labels: ['L', 'M', 'M', 'J', 'V', 'S', 'D'] }, position: { referencePanel: 'ca', direction: 'below' } },
    ],
  },
  {
    id: 'mur',
    title: 'Mur de calibration',
    route: '/mur/:position',
    display: { hideTabs: true, locked: true },
    panels: [
      { id: 'rouge', component: 'ms:color', params: { color: '#d33' } },
      { id: 'vert', component: 'ms:color', params: { color: '#2a2' }, position: { referencePanel: 'rouge', direction: 'right' } },
      { id: 'bleu', component: 'ms:color', params: { color: '#36c' }, position: { referencePanel: 'vert', direction: 'right' } },
    ],
  },
];
