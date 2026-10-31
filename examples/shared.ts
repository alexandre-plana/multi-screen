import 'dockview/dist/styles/dockview.css';
import { broadcastChannelTransport, webSocketTransport, type ScreenDefinition, type Transport } from 'multi-screen';
import { createPanelRegistry, registerBuiltinPanels, type PanelFactory } from 'multi-screen/dockview';

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

export function createDemoRegistry() {
  return registerBuiltinPanels(createPanelRegistry())
    .register('demo:kpi', kpi, { label: 'Indicateur' })
    .register('demo:bars', bars, { label: 'Histogramme' });
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
