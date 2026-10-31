/*
 * multi-screen — film de démonstration (60 s, 1920×1080).
 * Toute l'image est une fonction pure du temps : MS.render(ctx, t).
 * Aucune horloge, aucun état mutable entre deux images : le rendu est déterministe.
 * Les JSON, messages, patch, empreintes, routes et le QR code viennent de data.js,
 * produit par la bibliothèque elle-même (node motion/data.mjs).
 */
'use strict';
(function () {
  const W = 1920, H = 1080, DURATION = 60;
  const D = window.MS_DATA;

  /* ───────────────────────── Outils ───────────────────────── */
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const inv = (a, b, v) => clamp((v - a) / (b - a));
  const E = {
    lin: (k) => k,
    outCubic: (k) => 1 - Math.pow(1 - k, 3),
    outQuart: (k) => 1 - Math.pow(1 - k, 4),
    outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    outBack: (k) => { const c = 1.4; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
    inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    inCubic: (k) => k * k * k,
  };
  const seg = (t, a, b, e = E.outCubic) => e(inv(a, b, t));
  const pulse = (t, a, d) => (t < a || t > a + d ? 0 : Math.sin(Math.PI * (t - a) / d));
  const lr = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, k) { const A = hexToRgb(a), B = hexToRgb(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k)).toString(16).padStart(2, '0')).join(''); }
  function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
  const NB = ' '; // espace fine insécable, comme toLocaleString('fr-FR')
  const fr = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);

  /* ───────────────────────── Charte ───────────────────────── */
  const C = {
    bg: '#F6F7F9', card: '#FFFFFF', side: '#FAFBFC', line: '#D9DDE3', soft: '#EEF0F3', ink: '#1B1F24', muted: '#5D6673', faint: '#9AA3AE',
    accent: '#2F6FDE', accentSoft: '#E9F0FC', accentLine: '#B9CDF3', ok: '#1F8A4C', okSoft: '#E6F4EC', ko: '#C0392B', amber: '#B4561E', violet: '#8250DF',
    bezel: '#1B1F24',
  };
  // Thèmes dockview, valeurs relevées dans dockview/dist/styles/dockview.css (8.8.3).
  const DV = {
    light: { name: 'light', cls: 'dockview-theme-light', group: '#FFFFFF', tabs: '#F3F3F3', tabOn: '#FFFFFF', tab: '#333333', sep: '#CFCFCF', ink: '#1B1F24', muted: '#5D6673',
      vars: [['--dv-group-view-background-color', 'white', '#FFFFFF'], ['--dv-tabs-and-actions-container-background-color', '#f3f3f3', '#F3F3F3'], ['--dv-separator-border', 'rgba(128, 128, 128, 0.35)', '#CFCFCF'], ['--dv-activegroup-visiblepanel-tab-color', 'rgb(51, 51, 51)', '#333333']] },
    abyss: { name: 'abyss', cls: 'dockview-theme-abyss', group: '#000C18', tabs: '#1C1C2A', tabOn: '#000C18', tab: '#FFFFFF', sep: '#2B2B4A', ink: '#FFFFFF', muted: '#9497A9',
      vars: [['--dv-group-view-background-color', '#000c18', '#000C18'], ['--dv-tabs-and-actions-container-background-color', '#1c1c2a', '#1C1C2A'], ['--dv-separator-border', '#2b2b4a', '#2B2B4A'], ['--dv-activegroup-visiblepanel-tab-color', 'white', '#FFFFFF']] },
    dracula: { name: 'dracula', cls: 'dockview-theme-dracula', group: '#282A36', tabs: '#191A21', tabOn: '#282A36', tab: '#F8F8F2', sep: '#BD93F9', ink: '#F8F8F2', muted: '#6272A4',
      vars: [['--dv-group-view-background-color', '#282a36', '#282A36'], ['--dv-tabs-and-actions-container-background-color', '#191a21', '#191A21'], ['--dv-separator-border', '#bd93f9', '#BD93F9'], ['--dv-activegroup-visiblepanel-tab-color', 'rgb(248, 248, 242)', '#F8F8F2']] },
    gh: { name: 'githubDark', cls: 'dockview-theme-github-dark', group: '#0D1117', tabs: '#161B22', tabOn: '#0D1117', tab: '#E6EDF3', sep: '#30363D', ink: '#E6EDF3', muted: '#8B949E' },
  };
  const UP = '#4CC27F', DOWN = '#FF7A6B'; // examples/demo.css

  const FI = (w, s) => `${w} ${s}px Inter`;
  const FM = (w, s) => `${w} ${s}px "IBM Plex Mono"`;

  /* ───────────────────────── Dessin ───────────────────────── */
  let HAIR = 1;
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, Math.min(r, w / 2, h / 2))); }
  function txt(ctx, s, x, y, o = {}) {
    ctx.font = o.font || FI(400, 16); ctx.fillStyle = o.color || C.ink; ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'middle'; ctx.letterSpacing = (o.ls || 0) + 'px'; ctx.fillText(s, x, y); ctx.letterSpacing = '0px';
  }
  function tw(ctx, s, font, ls = 0) { ctx.font = font; ctx.letterSpacing = ls + 'px'; const w = ctx.measureText(s).width; ctx.letterSpacing = '0px'; return w; }
  function alpha(ctx, a, fn) { if (a <= 0.002) return; ctx.save(); ctx.globalAlpha *= Math.min(1, a); fn(); ctx.restore(); }
  function hl(ctx, x0, x1, y, c, w = HAIR) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  function vl(ctx, x, y0, y1, c, w = HAIR) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
  function card(ctx, x, y, w, h, o = {}) {
    const r = o.r ?? 14;
    ctx.save();
    ctx.shadowColor = o.shadow || 'rgba(27,31,36,0.07)'; ctx.shadowBlur = o.blur ?? 30; ctx.shadowOffsetY = o.dy ?? 10;
    rr(ctx, x, y, w, h, r); ctx.fillStyle = o.fill || C.card; ctx.fill();
    ctx.restore();
    rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.strokeStyle = o.stroke || C.line; ctx.lineWidth = 1; ctx.stroke();
  }
  function pill(ctx, x, y, label, o = {}) {
    const font = o.font || FM(500, 15); const h = o.h || 30; const padX = o.pad ?? 14;
    const iw = o.icon ? 20 : 0;
    const w = Math.max(o.minW || 0, tw(ctx, label, font) + padX * 2 + iw);
    const X0 = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
    rr(ctx, X0, y - h / 2, w, h, o.r ?? h / 2); ctx.fillStyle = o.bg || C.card; ctx.fill();
    if (o.bd) { ctx.strokeStyle = o.bd; ctx.lineWidth = 1; ctx.stroke(); }
    if (o.icon) o.icon(X0 + padX + 7, y);
    txt(ctx, label, X0 + padX + iw, y + 0.5, { font, color: o.color || C.ink });
    return w;
  }
  function check(ctx, x, y, s, c, lw = 2.2) {
    ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x - s * 0.12, y + s * 0.38); ctx.lineTo(x + s * 0.55, y - s * 0.42); ctx.stroke(); ctx.lineCap = 'butt';
  }
  function padlock(ctx, x, y, s, c) {
    ctx.strokeStyle = c; ctx.lineWidth = s * 0.16; ctx.beginPath(); ctx.arc(x, y - s * 0.12, s * 0.32, Math.PI, 0); ctx.lineTo(x + s * 0.32, y + s * 0.05); ctx.moveTo(x - s * 0.32, y - s * 0.12); ctx.lineTo(x - s * 0.32, y + s * 0.05); ctx.stroke();
    rr(ctx, x - s * 0.48, y + s * 0.02, s * 0.96, s * 0.7, s * 0.12); ctx.fillStyle = c; ctx.fill();
  }
  function pointer(ctx, x, y, press = 0, a = 1) {
    alpha(ctx, a, () => {
      if (press > 0.01) { ctx.beginPath(); ctx.arc(x, y, 10 + 18 * press, 0, Math.PI * 2); ctx.strokeStyle = rgba(C.accent, 0.45 * (1 - press)); ctx.lineWidth = 3; ctx.stroke(); }
      const s = 1.25 * (1 - 0.08 * Math.sin(Math.PI * clamp(press)));
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.lineTo(5.2, 17); ctx.lineTo(9, 25.5); ctx.lineTo(12.4, 24); ctx.lineTo(8.7, 15.8); ctx.lineTo(15.6, 15.6); ctx.closePath();
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#111'; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    });
  }
  function keycap(ctx, x, y, label, press = 0, a = 1) {
    alpha(ctx, a, () => {
      const font = FI(500, 20); const w = Math.max(56, tw(ctx, label, font) + 34); const h = 56; const dy = 3 * press;
      rr(ctx, x - w / 2, y - h / 2 + 4, w, h, 10); ctx.fillStyle = '#C9CED6'; ctx.fill();
      rr(ctx, x - w / 2, y - h / 2 + dy, w, h, 10); ctx.fillStyle = mix('#FFFFFF', C.accentSoft, press); ctx.fill();
      ctx.strokeStyle = press > 0.3 ? C.accent : C.line; ctx.lineWidth = 1.2; ctx.stroke();
      txt(ctx, label, x, y + dy, { font, align: 'center', color: C.ink });
    });
  }
  function bez(p0, p1, bend = 0.5) {
    const dx = (p1[0] - p0[0]) * bend;
    const c1 = [p0[0] + dx, p0[1]], c2 = [p1[0] - dx, p1[1]];
    return (u) => { const m = 1 - u; return [m * m * m * p0[0] + 3 * m * m * u * c1[0] + 3 * m * u * u * c2[0] + u * u * u * p1[0], m * m * m * p0[1] + 3 * m * m * u * c1[1] + 3 * m * u * u * c2[1] + u * u * u * p1[1]]; };
  }
  function dashed(ctx, f, k, color, o = {}) {
    if (k <= 0.001) return;
    ctx.save(); ctx.setLineDash(o.dash || [2, 7]); ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = o.w || 1.6;
    ctx.beginPath(); const n = 64; for (let i = 0; i <= n * k; i++) { const p = f(i / n); if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    ctx.stroke(); ctx.restore();
  }
  // Petit paquet qui voyage le long d'un lien
  function packet(ctx, f, u, label, o = {}) {
    if (u <= 0 || u >= 1) return;
    const p = f(E.inOutCubic(u)); const a = Math.min(1, u * 8, (1 - u) * 8);
    alpha(ctx, a, () => {
      if (label) pill(ctx, p[0], p[1], label, { font: FM(500, o.size || 14), h: o.h || 28, bg: o.bg || C.accent, color: o.color || '#fff', r: 6, pad: 10, icon: o.icon });
      else { rr(ctx, p[0] - (o.w || 14) / 2, p[1] - (o.hh || 10) / 2, o.w || 14, o.hh || 10, 3); ctx.fillStyle = o.bg || C.accent; ctx.fill(); }
    });
  }
  function typed(s, k) { return s.slice(0, Math.round(s.length * clamp(k))); }

  /* ───────────────────────── Écrans composés ───────────────────────── */
  // La composition : Texte à gauche, Indicateur déposé sur le bord droit, Horloge déposée sous le Texte.
  function compRects(x, y, w, h, k1 = 1, k2 = 1) {
    const rw = w * 0.5 * k1, lw = w - rw, bh = h * 0.5 * k2;
    return { T: [x, y, lw, h - bh], H: [x, y + h - bh, lw, bh], I: [x + lw, y, rw, h] };
  }
  function clockAt(t) { const s = 14 * 3600 + 32 * 60 + Math.floor(t); const p = (n) => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`; }
  function group(ctx, r, th, title, u, tabsK, content) {
    const [x, y, w, h] = r; if (w < 1 || h < 1) return;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = th.group; ctx.fillRect(x, y, w, h);
    const th_ = 30 * u * tabsK;
    if (th_ > 0.3) {
      ctx.fillStyle = th.tabs; ctx.fillRect(x, y, w, th_);
      const font = FI(400, 13 * u); const tabW = tw(ctx, title, font) + 44 * u;
      ctx.fillStyle = th.tabOn; ctx.fillRect(x, y, tabW, th_);
      alpha(ctx, tabsK, () => {
        txt(ctx, title, x + 11 * u, y + th_ / 2, { font, color: th.tab });
        const cx = x + tabW - 14 * u, cy = y + th_ / 2, s = 3.6 * u;
        ctx.strokeStyle = th.tab; ctx.globalAlpha *= 0.7; ctx.lineWidth = 1.1 * u; ctx.beginPath(); ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s); ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s); ctx.stroke();
      });
    }
    content(x, y + th_, w, h - th_);
    ctx.restore();
  }
  function drawComp(ctx, x, y, w, h, o = {}) {
    const th = o.th || DV.light; const u = o.u || 1; const tabs = o.tabs ?? 1; const t = o.t ?? 0;
    const R = compRects(x, y, w, h, o.k1 ?? 1, o.k2 ?? 1);
    group(ctx, R.T, th, 'Texte', u, tabs, (gx, gy, gw, gh) => {
      const font = FI(400, (o.textSize || 30) * u);
      const s = 'Bienvenue au salon';
      if (tw(ctx, s, font) < gw * 0.86) txt(ctx, s, gx + gw / 2, gy + gh / 2, { font, align: 'center', color: th.ink });
      else { txt(ctx, 'Bienvenue', gx + gw / 2, gy + gh / 2 - 19 * u, { font, align: 'center', color: th.ink }); txt(ctx, 'au salon', gx + gw / 2, gy + gh / 2 + 19 * u, { font, align: 'center', color: th.ink }); }
    });
    group(ctx, R.H, th, 'Horloge', u, tabs, (gx, gy, gw, gh) => {
      const size = Math.min(44 * u, gw * 0.17);
      txt(ctx, clockAt(t), gx + gw / 2, gy + gh / 2, { font: FI(600, size), align: 'center', color: th.ink });
    });
    group(ctx, R.I, th, 'Indicateur', u, tabs, (gx, gy, gw, gh) => {
      const px = gx + 22 * u, cy = gy + gh / 2;
      const vs = Math.min(42 * u, gw * 0.15);
      txt(ctx, 'Indicateur', px, cy - vs * 0.95, { font: FI(400, 15 * u), color: th.muted });
      const v = `${fr(o.value ?? 128400)}${NB}€`;
      if (o.flash > 0.01) { const vw = tw(ctx, v, FI(600, vs)); rr(ctx, px - 8 * u, cy - vs * 0.62, vw + 16 * u, vs * 1.24, 6 * u); ctx.fillStyle = rgba(C.accent, 0.22 * o.flash); ctx.fill(); }
      txt(ctx, v, px, cy, { font: FI(600, vs), color: th.ink });
      txt(ctx, `▲ ${o.trend ?? 3.5} %`, px, cy + vs * 0.9, { font: FI(400, 14 * u), color: UP });
    });
    ctx.fillStyle = th.sep;
    if ((o.k1 ?? 1) > 0.001) ctx.fillRect(R.I[0] - 0.5, y, 1, h);
    if ((o.k2 ?? 1) > 0.001) ctx.fillRect(x, R.H[1] - 0.5, R.T[2], 1);
    return R;
  }
  // Mur de calibration (examples/shared.ts) : trois aplats, onglets masqués, mise en page verrouillée.
  function drawMur(ctx, x, y, w, h) {
    const cols = ['#DD3333', '#22AA22', '#3366CC'];
    cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x + (w / 3) * i, y, w / 3 + 0.5, h); });
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + w / 3, y, 1, h); ctx.fillRect(x + (2 * w) / 3, y, 1, h);
  }
  // Tableau des ventes (examples/shared.ts), thème githubDark.
  function drawVentes(ctx, x, y, w, h, u) {
    const th = DV.gh; const R = compRects(x, y, w, h, 1, 1);
    const kpi = (label, v, unit, trend) => (gx, gy, gw, gh) => {
      const px = gx + 18 * u, cy = gy + gh / 2; const vs = Math.min(36 * u, gw * 0.15);
      txt(ctx, label, px, cy - vs * 0.95, { font: FI(400, 13 * u), color: th.muted });
      txt(ctx, `${fr(v)}${unit ? NB + unit : ''}`, px, cy, { font: FI(600, vs), color: th.ink });
      txt(ctx, `${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend)} %`, px, cy + vs * 0.88, { font: FI(400, 12 * u), color: trend >= 0 ? UP : DOWN });
    };
    group(ctx, R.T, th, 'Chiffre d’affaires', u, 1, kpi('Chiffre d’affaires', 128400, '€', 4.2));
    group(ctx, R.I, th, 'Commandes', u, 1, kpi('Commandes', 342, '', -1.5));
    group(ctx, R.H, th, 'Semaine', u, 1, (gx, gy, gw, gh) => {
      const vals = [12, 18, 9, 22, 30, 26, 14]; const lab = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
      txt(ctx, 'Ventes par jour', gx + 12 * u, gy + 14 * u, { font: FI(400, 12 * u), color: th.muted });
      const bw = (gw - 24 * u) / 7; const base = gy + gh - 18 * u; const top = gy + 30 * u;
      vals.forEach((v, i) => { const bh = (base - top) * (v / 30); ctx.fillStyle = '#6A9CFF'; ctx.fillRect(gx + 12 * u + i * bw + bw * 0.18, base - bh, bw * 0.64, bh); txt(ctx, lab[i], gx + 12 * u + i * bw + bw / 2, base + 9 * u, { font: FI(400, 10 * u), align: 'center', color: th.muted }); });
    });
    ctx.fillStyle = th.sep; ctx.fillRect(R.I[0] - 0.5, y, 1, h); ctx.fillRect(x, R.H[1] - 0.5, R.T[2], 1);
  }
  function emptyScreen(ctx, x, y, w, h, label, u) {
    ctx.fillStyle = '#F2F3F5'; ctx.fillRect(x, y, w, h);
    txt(ctx, label, x + w / 2, y + h / 2, { font: FI(400, 15 * u), align: 'center', color: C.muted });
  }
  // Cadres d'appareils
  function bezel(ctx, x, y, w, h, o = {}) {
    const b = o.b ?? 10, r = o.r ?? 12;
    ctx.save(); ctx.shadowColor = 'rgba(27,31,36,0.16)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
    rr(ctx, x - b, y - b, w + 2 * b, h + 2 * b, r); ctx.fillStyle = o.color || C.bezel; ctx.fill(); ctx.restore();
  }
  function screenClip(ctx, x, y, w, h, fn) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); fn(); ctx.restore(); }
  function tvStand(ctx, x, y, w, h) {
    const cx = x + w / 2; ctx.fillStyle = '#2B3038';
    ctx.fillRect(cx - 5, y + h + 10, 10, 26); rr(ctx, cx - w * 0.16, y + h + 34, w * 0.32, 7, 3.5); ctx.fill();
  }
  function browser(ctx, x, y, w, bodyH, url, a, body) {
    alpha(ctx, a, () => {
      card(ctx, x, y, w, bodyH + 42, { r: 12 });
      ['#E0E3E8', '#E0E3E8', '#E0E3E8'].forEach((c, i) => { ctx.beginPath(); ctx.arc(x + 20 + i * 16, y + 21, 5, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); });
      rr(ctx, x + 72, y + 9, w - 86, 24, 12); ctx.fillStyle = C.bg; ctx.fill();
      txt(ctx, url, x + 86, y + 21.5, { font: FM(400, 14), color: C.muted });
      hl(ctx, x, x + w, y + 42.5, C.line);
      ctx.save(); ctx.beginPath(); ctx.roundRect(x + 1, y + 43, w - 2, bodyH - 1, [0, 0, 11, 11]); ctx.clip(); body(x + 1, y + 43, w - 2, bodyH - 1); ctx.restore();
    });
  }

  /* ───────────────────────── Légendes ───────────────────────── */
  const CH = [
    { n: '01', label: 'COMPOSER', title: 'On compose l’écran en glissant des panneaux.', t0: 5.0, t1: 14.6 },
    { n: '02', label: 'L’ÉCRAN EST UNE DONNÉE', title: 'Un écran, c’est du JSON : stocké, versionné, comparable.', t0: 14.8, t1: 21.8 },
    { n: '03', label: 'ROUTES DYNAMIQUES', title: 'Des routes ajoutées et retirées pendant l’exécution.', t0: 22.0, t1: 29.8 },
    { n: '04', label: 'DIFFUSER', title: 'On l’envoie, on le met à jour par patch, chacun accuse réception.', t0: 30.0, t1: 39.4 },
    { n: '05', label: 'RÉGLER L’AFFICHAGE', title: 'Rotation, résolution, thème, verrouillage : à distance.', t0: 39.6, t1: 47.8 },
    { n: '06', label: 'PARTOUT', title: 'Même navigateur, réseau ou simple lien.', t0: 48.0, t1: 53.6 },
  ];
  function drawCaptions(ctx, t) {
    for (const c of CH) {
      const a = seg(t, c.t0, c.t0 + 0.5) * (1 - seg(t, c.t1 - 0.4, c.t1));
      if (a <= 0.002) continue;
      const dx = (1 - seg(t, c.t0, c.t0 + 0.6, E.outExpo)) * -16;
      alpha(ctx, a, () => {
        txt(ctx, `${c.n} — ${c.label}`, 96 + dx, 70, { font: FM(500, 15), color: C.accent, ls: 1.5 });
        txt(ctx, c.title, 96 + dx, 108, { font: FI(600, 30), color: C.ink, ls: -0.3 });
        txt(ctx, `${c.n} / 06`, 1824, 70, { font: FM(500, 15), color: C.muted, align: 'right', ls: 1 });
        txt(ctx, 'MULTI-SCREEN', 1824, 96, { font: FM(500, 12), color: C.faint, align: 'right', ls: 2.5 });
        hl(ctx, 1824 - 64 * seg(t, c.t0 + 0.1, c.t0 + 0.8), 1824, 118, C.line);
      });
    }
  }

  /* ───────────────────────── Ouverture 0:00–0:05 ───────────────────────── */
  const EX = 96, EY = 150, ES = 1.35; // éditeur : 1280 × 640 logiques, ×1.35
  const ea = (x, y) => [EX + x * ES, EY + y * ES];
  const CV = [252, 108, 736, 520];
  const CVA = [EX + CV[0] * ES, EY + CV[1] * ES, CV[2] * ES, CV[3] * ES];
  function drawIntro(ctx, t) {
    if (t > 5.4) return;
    const cx = 960, cy = 540;
    // 1. le panneau se dessine
    const small = [cx - 80, cy - 50, 160, 100];
    const g0 = [cx - 300, cy - 169, 600, 338];
    const g1 = [300, cy - 169, 600, 338];
    const grow = seg(t, 1.25, 2.15, E.inOutCubic);
    const slide = seg(t, 2.55, 3.35, E.inOutCubic);
    const land = seg(t, 4.35, 5.15, E.inOutCubic);
    let r = lr(lr(small, g0, grow), g1, slide);
    r = lr(r, CVA, land);
    const fade = 1 - seg(t, 4.85, 5.3);
    alpha(ctx, fade, () => {
      const [x, y, w, h] = r;
      const draw = seg(t, 0.25, 1.0, E.inOutCubic);
      const fill = seg(t, 0.8, 1.2);
      if (fill < 1) {
        const per = 2 * (w + h);
        ctx.save(); ctx.setLineDash([per * draw, per]); rr(ctx, x, y, w, h, 6); ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
      }
      // 2. il s'étire en grille dockview à trois zones
      const k1r = seg(t, 1.75, 2.35, E.outCubic), k2r = seg(t, 2.05, 2.65, E.outCubic);
      const k1 = k1r * (1 - land), k2 = k2r * (1 - land);
      const R = compRects(x, y, w, h, k1, k2);
      const gap = 8 * Math.min(k1 + k2, 1) * (1 - land);
      const cell = (q, c, glyph) => { const [qx, qy, qw, qh] = q; if (qw < 2 || qh < 2) return; rr(ctx, qx + gap / 2, qy + gap / 2, qw - gap, qh - gap, 6); ctx.fillStyle = c; ctx.fill(); if (glyph) glyph(qx, qy, qw, qh); };
      alpha(ctx, fill, () => {
        const white = mix(C.accent, '#FFFFFF', Math.min(k1r * 1.2, 1));
        cell(R.T, k1r > 0.02 ? white : C.accent, (qx, qy, qw, qh) => alpha(ctx, k1 * (1 - land), () => {
          ctx.fillStyle = C.soft; rr(ctx, qx + 26, qy + qh / 2 - 9, qw * 0.55, 10, 5); ctx.fill(); rr(ctx, qx + 26, qy + qh / 2 + 9, qw * 0.35, 10, 5); ctx.fill();
          rr(ctx, qx + gap / 2 + 0.5, qy + gap / 2 + 0.5, qw - gap - 1, qh - gap - 1, 6); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
        }));
        cell(R.H, mix(C.accent, '#FFFFFF', k2r), (qx, qy, qw, qh) => alpha(ctx, k2 * (1 - land), () => {
          ctx.fillStyle = C.soft; rr(ctx, qx + qw / 2 - 50, qy + qh / 2 - 8, 100, 16, 8); ctx.fill();
          rr(ctx, qx + gap / 2 + 0.5, qy + gap / 2 + 0.5, qw - gap - 1, qh - gap - 1, 6); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
        }));
        cell(R.I, C.accent, (qx, qy, qw, qh) => alpha(ctx, k1 * (1 - land), () => {
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; rr(ctx, qx + 26, qy + qh / 2 - 34, 70, 9, 4.5); ctx.fill();
          ctx.fillStyle = '#FFFFFF'; rr(ctx, qx + 26, qy + qh / 2 - 12, qw * 0.5, 24, 6); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; rr(ctx, qx + 26, qy + qh / 2 + 24, 50, 9, 4.5); ctx.fill();
        }));
      });
    });
    // 3. le titre
    const ta = seg(t, 2.85, 3.6) * (1 - seg(t, 4.2, 4.7));
    alpha(ctx, ta, () => {
      const lift = (1 - seg(t, 2.85, 3.7, E.outExpo)) * 24 - seg(t, 4.2, 4.7, E.inCubic) * 20;
      const X = 980;
      txt(ctx, 'npm install multi-screen', X, 400 + lift, { font: FM(500, 18), color: C.accent, ls: 0.5 });
      txt(ctx, 'multi-screen', X - 4, 492 + lift, { font: FI(600, 112), color: C.ink, ls: -3 });
      alpha(ctx, seg(t, 3.15, 3.9), () => txt(ctx, '— composez, routez, diffusez vos écrans', X, 590 + lift * 1.3, { font: FI(400, 36), color: C.muted, ls: -0.3 }));
      alpha(ctx, seg(t, 3.4, 4.0), () => txt(ctx, 'TypeScript · dockview · sans framework · MIT', X, 660 + lift * 1.5, { font: FM(400, 17), color: C.faint, ls: 0.5 }));
    });
  }

  /* ───────────────────────── 01 Composer 0:05–0:15 ───────────────────────── */
  const PALETTE = [['Texte', 'ms:text'], ['Image', 'ms:image'], ['Page web', 'ms:iframe'], ['Horloge', 'ms:clock'], ['Couleur unie', 'ms:color'], ['Indicateur', 'demo:kpi'], ['Histogramme', 'demo:bars']];
  const palY = (i) => 300 + i * 46;
  // Trajectoire du pointeur (coordonnées logiques de l'éditeur) : [t, x, y]
  const PATH1 = [
    [5.5, 700, 700], [6.35, 120, palY(5) + 21], [6.6, 120, palY(5) + 21], [7.75, 944, 352], [8.05, 944, 352],
    [8.95, 118, palY(3) + 21], [9.1, 118, palY(3) + 21], [10.2, 436, 596], [10.45, 436, 596],
    [11.15, 800, 300], [11.35, 800, 300], [11.95, 1140, 241], [14.0, 1140, 241],
  ];
  function along(path, t) {
    if (t <= path[0][0]) return [path[0][1], path[0][2]];
    for (let i = 1; i < path.length; i++) {
      const [t1, x1, y1] = path[i]; const [t0, x0, y0] = path[i - 1];
      if (t <= t1) { const k = E.inOutCubic(inv(t0, t1, t)); return [lerp(x0, x1, k), lerp(y0, y1, k)]; }
    }
    const l = path[path.length - 1]; return [l[1], l[2]];
  }
  const DROP1 = 8.05, DROP2 = 10.45, SEL_I = 11.35, VALUE_CLICK = 12.0, ENTER = 13.0, SAVE = 13.65;
  const TYPE0 = 12.3;
  const editorK1 = (t) => seg(t, DROP1, DROP1 + 0.5);
  const editorK2 = (t) => seg(t, DROP2, DROP2 + 0.5);
  const valueAt = (t) => (t < ENTER + 0.05 ? 1200 : 128400);
  function field(ctx, x, y, w, label, value, o = {}) {
    if (label) txt(ctx, label, x, y, { font: FI(400, 11.5), color: C.muted });
    const fy = y + 10;
    rr(ctx, x, fy, w, 30, 5); ctx.fillStyle = o.ro ? '#F8F9FA' : '#FFFFFF'; ctx.fill();
    ctx.strokeStyle = o.focus ? C.accent : C.line; ctx.lineWidth = o.focus ? 1.6 : 1 / ES; ctx.stroke();
    if (o.focus) { rr(ctx, x - 2.5, fy - 2.5, w + 5, 35, 7); ctx.strokeStyle = rgba(C.accent, 0.25); ctx.lineWidth = 2; ctx.stroke(); }
    if (o.sel && value) { const vw = tw(ctx, value, FI(400, 13)); ctx.fillStyle = rgba(C.accent, 0.25); ctx.fillRect(x + 8, fy + 7, vw + 2, 16); }
    if (o.checkbox !== undefined) {
      rr(ctx, x + 8, fy + 8, 14, 14, 3); ctx.fillStyle = o.checkbox ? C.accent : '#fff'; ctx.fill(); if (o.checkbox) check(ctx, x + 15, fy + 15, 7, '#fff', 1.6);
      else { ctx.strokeStyle = C.line; ctx.stroke(); }
    } else txt(ctx, value, x + 9, fy + 15.5, { font: FI(400, 13), color: o.ph ? C.faint : C.ink });
    if (o.caret) { const vw = tw(ctx, value, FI(400, 13)); vl(ctx, x + 10 + vw, fy + 7, fy + 23, C.ink, 1.2); }
  }
  function btn(ctx, x, y, w, label, o = {}) {
    rr(ctx, x, y, w, 32, 6);
    ctx.fillStyle = o.primary ? (o.pale ? '#9DBBEE' : C.accent) : '#FFFFFF'; ctx.fill();
    if (!o.primary) { ctx.strokeStyle = C.line; ctx.lineWidth = 1 / ES; ctx.stroke(); }
    txt(ctx, label, x + w / 2, y + 16.5, { font: FI(o.primary ? 500 : 400, 13), color: o.primary ? '#fff' : o.color || C.ink, align: 'center' });
  }
  function drawEditor(ctx, t) {
    if (t < 4.6 || t > 15.4) return;
    const appear = seg(t, 4.75, 5.45); const out = seg(t, 14.3, 14.9);
    const A = appear * (1 - out);
    const k1 = editorK1(t), k2 = editorK2(t);
    ctx.save();
    // fenêtre
    alpha(ctx, A, () => {
      const dy = (1 - seg(t, 4.75, 5.6, E.outExpo)) * 18;
      ctx.translate(0, dy);
      card(ctx, EX, EY, 1280 * ES, 640 * ES, { r: 16 });
      ctx.save(); ctx.translate(EX, EY); ctx.scale(ES, ES); HAIR = 1 / ES;
      ctx.beginPath(); ctx.roundRect(0, 0, 1280, 640, 16 / ES); ctx.clip();
      // barre de titre
      txt(ctx, 'Éditeur d’écrans', 16, 22, { font: FI(600, 16) });
      const lx = 16 + tw(ctx, 'Éditeur d’écrans', FI(600, 16)) + 14;
      txt(ctx, 'Régie', lx, 22, { font: FI(400, 13), color: C.accent }); hl(ctx, lx, lx + 32, 30, C.accent);
      txt(ctx, 'Accueil', lx + 46, 22, { font: FI(400, 13), color: C.accent }); hl(ctx, lx + 46, lx + 92, 30, C.accent);
      txt(ctx, 'BroadcastChannel (même navigateur)', 1264, 22, { font: FI(400, 12), color: C.muted, align: 'right' });
      hl(ctx, 0, 1280, 44, C.line);
      // colonne de gauche
      ctx.fillStyle = C.side; ctx.fillRect(0, 44.5, 240, 596); ctx.fillRect(1000, 44.5, 280, 596);
      vl(ctx, 240, 44, 640, C.line); vl(ctx, 1000, 44, 640, C.line);
      txt(ctx, 'ÉCRANS', 12, 62, { font: FI(600, 11), color: C.muted, ls: 0.8 });
      rr(ctx, 12, 74, 124, 30, 6); ctx.fillStyle = C.accent; ctx.fill(); txt(ctx, '+ Nouvel écran', 74, 89.5, { font: FI(500, 13), color: '#fff', align: 'center' });
      ['Accueil', 'Tableau des ventes', 'Mur de calibration'].forEach((s, i) => {
        const y = 112 + i * 36; rr(ctx, 12, y, 216, 30, 6); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = i === 0 ? C.accent : C.line; ctx.lineWidth = i === 0 ? 1.5 : 1 / ES; ctx.stroke();
        txt(ctx, s, 22, y + 15.5, { font: FI(400, 13) });
      });
      txt(ctx, 'PANNEAUX', 12, 236, { font: FI(600, 11), color: C.muted, ls: 0.8 });
      ['Glissez un panneau sur le canevas,', 'ou cliquez pour l’ajouter à côté', 'du panneau actif.'].forEach((s, i) => txt(ctx, s, 12, 252 + i * 15, { font: FI(400, 11.5), color: C.muted }));
      PALETTE.forEach(([label, id], i) => {
        const y = palY(i);
        const picked = (i === 5 && t >= 6.5 && t < DROP1) || (i === 3 && t >= 9.0 && t < DROP2);
        const hover = (i === 5 && t > 6.2 && t < 6.6) || (i === 3 && t > 8.85 && t < 9.1);
        rr(ctx, 12, y, 216, 42, 6); ctx.fillStyle = picked ? C.accentSoft : '#fff'; ctx.fill();
        ctx.strokeStyle = picked || hover ? C.accent : C.line; ctx.lineWidth = picked || hover ? 1.4 : 1 / ES; ctx.stroke();
        txt(ctx, label, 22, y + 14, { font: FI(400, 13) });
        txt(ctx, id, 22, y + 30, { font: FM(400, 10.5), color: C.muted });
      });
      // barre d'outils
      rr(ctx, 252, 54, 236, 32, 6); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1 / ES; ctx.stroke();
      txt(ctx, 'Accueil', 262, 70.5, { font: FI(600, 14) });
      const dirty = t >= DROP1 + 0.2 && t < SAVE;
      btn(ctx, 496, 54, 96, 'Enregistrer', { primary: true, pale: !dirty });
      if (t >= DROP1 + 0.2 && t < SAVE) txt(ctx, 'Modifications non enregistrées', 602, 70.5, { font: FI(400, 12), color: C.muted });
      if (t >= SAVE) alpha(ctx, seg(t, SAVE, SAVE + 0.25), () => { check(ctx, 608, 70, 9, C.ok, 1.8); txt(ctx, 'Enregistré', 620, 70.5, { font: FI(500, 12.5), color: C.ok }); });
      btn(ctx, 803, 54, 86, 'Dupliquer'); btn(ctx, 897, 54, 91, 'Supprimer', { color: C.ko });
      hl(ctx, 240, 1000, 96, C.line);
      // canevas
      ctx.fillStyle = '#E9EBEF'; ctx.fillRect(CV[0] - 1, CV[1] - 1, CV[2] + 2, CV[3] + 2);
      const R = drawComp(ctx, CV[0], CV[1], CV[2], CV[3], { th: DV.light, k1, k2, u: 1, value: valueAt(t), flash: pulse(t, ENTER + 0.05, 0.9), t, textSize: 30 });
      // cibles de dépôt (surbrillance dockview)
      const z1 = seg(t, 7.4, 7.7) * (1 - seg(t, DROP1, DROP1 + 0.15));
      const z2 = seg(t, 9.95, 10.2) * (1 - seg(t, DROP2, DROP2 + 0.15));
      const zone = (r, a) => alpha(ctx, a, () => { rr(ctx, r[0] + 3, r[1] + 3, r[2] - 6, r[3] - 6, 4); ctx.fillStyle = rgba(C.accent, 0.16); ctx.fill(); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.stroke(); });
      zone([CV[0] + CV[2] / 2, CV[1], CV[2] / 2, CV[3]], z1);
      zone([R.T[0], R.T[1] + R.T[3] / 2, R.T[2], R.T[3] / 2], z2);
      // sélection
      const selRect = t < DROP1 ? null : t < DROP2 ? R.I : t < SEL_I ? R.H : R.I;
      if (selRect) { ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.strokeRect(selRect[0] + 1, selRect[1] + 1, selRect[2] - 2, selRect[3] - 2); }
      // le panneau bleu se pose
      const landing = (td, target, from) => {
        const k = seg(t, td, td + 0.42, E.outCubic); const a = 1 - seg(t, td + 0.28, td + 0.8);
        if (t < td || a <= 0) return;
        const r = lr(from, target, k);
        alpha(ctx, a, () => screenClip(ctx, ...CV, () => { rr(ctx, r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4, 6); ctx.fillStyle = C.accent; ctx.fill(); }));
      };
      const p1 = along(PATH1, DROP1), p2 = along(PATH1, DROP2);
      // il vise la taille finale du groupe, pendant que le groupe s'ouvre
      landing(DROP1, compRects(...CV, 1, 0).I, [p1[0] - 45, p1[1] - 16, 150, 40]);
      landing(DROP2, compRects(...CV, 1, 1).H, [p2[0] - 45, p2[1] - 16, 150, 40]);
      // inspecteur
      const insp = t < DROP1 + 0.3 ? 'none' : t < DROP2 + 0.2 ? 'I' : t < SEL_I + 0.05 ? 'H' : 'I';
      txt(ctx, 'PANNEAU SÉLECTIONNÉ', 1012, 62, { font: FI(600, 11), color: C.muted, ls: 0.8 });
      if (insp === 'none') {
        ['Sélectionnez un panneau dans le canevas', 'pour le modifier.'].forEach((s, i) => txt(ctx, s, 1012, 88 + i * 17, { font: FI(400, 12), color: C.muted }));
      } else if (insp === 'H') {
        txt(ctx, 'Horloge · ms-clock-1', 1012, 88, { font: FI(400, 12), color: C.muted });
        field(ctx, 1012, 112, 256, 'Titre de l’onglet', 'Horloge');
        field(ctx, 1012, 164, 256, 'timeZone', '');
        field(ctx, 1012, 216, 256, 'locale', '');
        field(ctx, 1012, 268, 256, 'seconds', '', { checkbox: true });
        field(ctx, 1012, 320, 256, 'size', '3em');
      } else {
        const focus = t >= VALUE_CLICK && t < ENTER + 0.1;
        const nTyped = clamp(Math.floor((t - TYPE0) / 0.1) + 1, 0, 6);
        const val = t < TYPE0 ? '1200' : t < ENTER + 0.05 ? '128400'.slice(0, nTyped) : '128400';
        txt(ctx, 'Indicateur · demo-kpi-1', 1012, 88, { font: FI(400, 12), color: C.muted });
        field(ctx, 1012, 112, 256, 'Titre de l’onglet', 'Indicateur');
        field(ctx, 1012, 164, 256, 'label', 'Indicateur');
        field(ctx, 1012, 216, 256, 'value', val, { focus, sel: t >= VALUE_CLICK + 0.12 && t < TYPE0, caret: focus && t >= TYPE0 && Math.floor(t * 3) % 2 === 0 });
        field(ctx, 1012, 268, 256, 'unit', '€');
        field(ctx, 1012, 320, 256, 'trend', '3.5');
        txt(ctx, '▸ Paramètres (JSON)', 1012, 378, { font: FI(400, 12), color: C.ink });
        btn(ctx, 1012, 394, 142, 'Retirer le panneau', { color: C.ko });
      }
      txt(ctx, 'ÉCRAN', 1012, 452, { font: FI(600, 11), color: C.muted, ls: 0.8 });
      field(ctx, 1012, 474, 256, 'Identifiant', 'accueil', { ro: true });
      field(ctx, 1012, 526, 256, 'Route', '/accueil');
      field(ctx, 1012, 578, 256, 'Thème', 'light');
      ctx.restore(); HAIR = 1;
    });
    // fantôme bleu pendant les glissés
    const drag = (t0, t1, label) => {
      if (t < t0 || t > t1) return;
      const p = ea(...along(PATH1, t)); const k = seg(t, t0, t0 + 0.2, E.outBack);
      const w = 150 * ES * k, h = 40 * ES * k;
      ctx.save(); ctx.shadowColor = 'rgba(47,111,222,0.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      rr(ctx, p[0] - w * 0.3, p[1] - h / 2 + 6, w, h, 6); ctx.fillStyle = C.accent; ctx.fill(); ctx.restore();
      alpha(ctx, k, () => txt(ctx, label, p[0] - w * 0.3 + w / 2, p[1] + 6.5, { font: FI(500, 17), color: '#fff', align: 'center' }));
    };
    alpha(ctx, A, () => { drag(6.55, DROP1, 'Indicateur'); drag(9.05, DROP2, 'Horloge'); });
    // annotation : le panneau est mis à jour, pas recréé
    alpha(ctx, seg(t, ENTER + 0.15, ENTER + 0.5) * (1 - seg(t, 14.1, 14.4)), () => {
      const R = compRects(...CVA, 1, 1); const x = R.I[0] + R.I[2] / 2, y = R.I[1] + 84;
      pill(ctx, x, y, 'updateParameters() · pas recréé', { font: FM(500, 15), bg: C.accentSoft, bd: C.accentLine, color: C.accent, h: 34, r: 8 });
    });
    // clavier
    keycap(ctx, ea(620, 0)[0], 958, 'Entrée', pulse(t, ENTER - 0.05, 0.25), seg(t, ENTER - 0.35, ENTER - 0.15) * (1 - seg(t, ENTER + 0.3, ENTER + 0.5)));
    const ks = seg(t, SAVE - 0.45, SAVE - 0.25) * (1 - seg(t, SAVE + 0.55, SAVE + 0.8));
    keycap(ctx, ea(620, 0)[0] - 40, 958, 'Ctrl', t > SAVE - 0.2 && t < SAVE + 0.3 ? 1 : 0, ks);
    keycap(ctx, ea(620, 0)[0] + 32, 958, 'S', pulse(t, SAVE - 0.08, 0.3), ks);
    // pointeur
    if (t > 5.45 && t < 14.4) {
      const p = ea(...along(PATH1, t));
      const press = Math.max(pulse(t, 6.45, 0.3), pulse(t, 9.0, 0.3), pulse(t, SEL_I - 0.08, 0.3), pulse(t, VALUE_CLICK - 0.08, 0.3));
      pointer(ctx, p[0], p[1], press, seg(t, 5.45, 5.7) * (1 - seg(t, 13.9, 14.3)) * A);
    }
    ctx.restore();
  }

  /* ───────────────────────── 02 L'écran est une donnée 0:15–0:22 ───────────────────────── */
  const JC = [280, 186, 960, 742];
  const JLH = 32, JFS = 16;
  function jsonLines() {
    const S = D.screen; const q = (s) => JSON.stringify(s);
    const P = (id) => S.panels.find((p) => p.id === id);
    const tok = (...parts) => parts;
    const params = (o) => { const out = [['{ ', 'p']]; Object.entries(o).forEach(([k, v], i) => { if (i) out.push([', ', 'p']); out.push([q(k), 'k'], [': ', 'p'], [q(v), typeof v === 'string' ? 's' : 'n']); }); out.push([' }', 'p']); return out; };
    const panel = (id, last) => {
      const p = P(id);
      return [
        tok(['      ', 'p'], [q(p.id), 'k'], [': { ', 'p'], ['"contentComponent"', 'k'], [': ', 'p'], [q(p.contentComponent), 's'], [', ', 'p'], ['"title"', 'k'], [': ', 'p'], [q(p.title), 's'], [',', 'p']),
        tok(['        ', 'p'], ['"params"', 'k'], [': ', 'p'], ...params(p.params), [last ? ' }' : ' },', 'p']),
      ];
    };
    const lines = [
      tok(['{', 'p']),
      tok(['  ', 'p'], ['"id"', 'k'], [': ', 'p'], [q(S.id), 's'], [',', 'p']),
      tok(['  ', 'p'], ['"title"', 'k'], [': ', 'p'], [q(S.title), 's'], [',', 'p']),
      tok(['  ', 'p'], ['"route"', 'k'], [': ', 'p'], [q(S.route), 's'], [',', 'p']),
      tok(['  ', 'p'], ['"layout"', 'k'], [': {', 'p']),
      tok(['    ', 'p'], ['"grid"', 'k'], [': { ', 'p'], ['"orientation"', 'k'], [': ', 'p'], [q(S.gridOrientation), 's'], [', … },', 'p']),
      tok(['    ', 'p'], ['"panels"', 'k'], [': {', 'p']),
      ...panel('ms-text-1'), ...panel('demo-kpi-1'), ...panel('ms-clock-1', true),
      tok(['    }', 'p']),
      tok(['  },', 'p']),
      tok(['  ', 'p'], ['"theme"', 'k'], [': { ', 'p'], ['"base"', 'k'], [': ', 'p'], [q(S.theme.base), 's'], [' },', 'p']),
      tok(['  ', 'p'], ['"display"', 'k'], [': { ', 'p'], ['"cursor"', 'k'], [': ', 'p'], [q(S.display.cursor), 's'], [' },', 'p']),
      tok(['  ', 'p'], ['"version"', 'k'], [': ', 'p'], ['VERSION', 'n']),
      tok(['}', 'p']),
    ];
    return lines;
  }
  const JL = jsonLines();
  const J_ROUTE = 3, J_TEXT = 7, J_KPI = 9, J_CLOCK = 11, J_DISPLAY = 16;
  const INSERT = 18.0, PUT = 18.85;
  const TOKC = { p: C.faint, k: C.ink, s: '#1F7A4D', n: C.amber };
  function jsonGeom(t) {
    const ins = seg(t, INSERT, INSERT + 0.4, E.outCubic);
    const scroll = (1 - seg(t, 14.9, 17.2, E.outCubic)) * 70;
    const y0 = JC[1] + 70 + scroll;
    const ly = (i) => y0 + (i < J_DISPLAY ? i : i === J_DISPLAY ? J_DISPLAY : i - 1 + ins) * JLH;
    return { ly, ins };
  }
  function drawJSON(ctx, t) {
    if (t < 14.3 || t > 22.6) return;
    const out = seg(t, 21.35, 22.0, E.inOutCubic);
    const morph = seg(t, 14.35, 15.35, E.inOutCubic);
    const { ly, ins } = jsonGeom(t);
    const cardRect = lr(CVA, JC, morph);
    alpha(ctx, 1 - out, () => {
      ctx.save(); ctx.translate(-120 * out, 0);
      card(ctx, ...cardRect, { r: lerp(0, 16, morph) });
      // composition qui se replie en lignes
      if (morph < 1) {
        const R = compRects(...CVA, 1, 1);
        const targets = { T: [JC[0] + 24, ly(J_TEXT) - JLH / 2, JC[2] - 48, JLH * 2], I: [JC[0] + 24, ly(J_KPI) - JLH / 2, JC[2] - 48, JLH * 2], H: [JC[0] + 24, ly(J_CLOCK) - JLH / 2, JC[2] - 48, JLH * 2] };
        alpha(ctx, 1 - seg(t, 14.35, 14.8), () => screenClip(ctx, ...CVA, () => drawComp(ctx, ...CVA, { th: DV.light, value: 128400, t, u: ES, textSize: 30 })));
        for (const id of ['T', 'H', 'I']) {
          const r = lr(R[id], targets[id], morph);
          const c = id === 'I' ? C.accent : '#FFFFFF';
          alpha(ctx, seg(t, 14.35, 14.7) * (1 - seg(t, 15.0, 15.4)), () => { rr(ctx, r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4, 6); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = id === 'I' ? C.accent : C.line; ctx.lineWidth = 1; ctx.stroke(); });
        }
      }
      // en-tête de la carte
      alpha(ctx, seg(t, 15.0, 15.5), () => {
        txt(ctx, 'ScreenDefinition', JC[0] + 28, JC[1] + 32, { font: FM(600, 15), color: C.accent, ls: 0.5 });
        txt(ctx, 'telle qu’enregistrée par l’éditeur (view.toScreen())', JC[0] + 28 + tw(ctx, 'ScreenDefinition', FM(600, 15), 0.5) + 14, JC[1] + 32, { font: FI(400, 14), color: C.muted });
        hl(ctx, JC[0], JC[0] + JC[2], JC[1] + 52, C.line);
      });
      ctx.save(); ctx.beginPath(); ctx.rect(JC[0], JC[1] + 53, JC[2], JC[3] - 54); ctx.clip();
      // surlignages : l'indicateur reste bleu
      const hlA = seg(t, 15.2, 15.5);
      alpha(ctx, hlA, () => {
        rr(ctx, JC[0] + 24, ly(J_KPI) - JLH / 2, JC[2] - 48, JLH * 2, 6); ctx.fillStyle = C.accentSoft; ctx.fill();
        ctx.fillStyle = C.accent; ctx.fillRect(JC[0] + 24, ly(J_KPI) - JLH / 2, 4, JLH * 2);
      });
      if (ins > 0) alpha(ctx, ins * (1 - seg(t, 20.0, 20.6)), () => { rr(ctx, JC[0] + 24, ly(J_DISPLAY) - JLH / 2, JC[2] - 48, JLH, 6); ctx.fillStyle = C.okSoft; ctx.fill(); });
      const rk = seg(t, 20.2, 20.6, E.outCubic);
      if (rk > 0) { rr(ctx, JC[0] + 24, ly(J_ROUTE) - JLH / 2, (JC[2] - 48) * rk, JLH, 6); ctx.fillStyle = C.accent; ctx.fill(); }
      // texte
      JL.forEach((line, i) => {
        if (i === J_DISPLAY && ins <= 0) return;
        const appear = seg(t, 14.95 + i * 0.045, 15.25 + i * 0.045);
        if (appear <= 0) return;
        let x = JC[0] + 40; const y = ly(i);
        let typedChars = Infinity;
        if (i === J_DISPLAY) typedChars = Math.floor(inv(INSERT + 0.1, INSERT + 0.7, t) * 60);
        alpha(ctx, i === J_DISPLAY ? 1 : appear, () => {
          let n = 0;
          for (const [s0, k] of line) {
            let s = s0 === 'VERSION' ? String(t < PUT + 0.1 ? D.versions[0].version : D.versions[1].version) : s0;
            if (n >= typedChars) break;
            if (n + s.length > typedChars) s = s.slice(0, typedChars - n);
            n += s.length;
            const font = FM(k === 'k' ? 500 : 400, JFS);
            const col = i === J_ROUTE && rk > 0.5 ? '#FFFFFF' : TOKC[k];
            txt(ctx, s, x, y, { font, color: s0 === 'VERSION' ? C.ink : col });
            x += tw(ctx, s, font);
          }
        });
      });
      ctx.restore();
      // colonne de droite : store versionné
      const RX = 1300, RW = 524;
      alpha(ctx, seg(t, 15.4, 15.9), () => {
        card(ctx, RX, JC[1], RW, 330);
        txt(ctx, 'ScreenStore', RX + 28, JC[1] + 32, { font: FM(600, 15), color: C.accent, ls: 0.5 });
        hl(ctx, RX, RX + RW, JC[1] + 52, C.line);
        txt(ctx, 'version', RX + 28, JC[1] + 92, { font: FI(400, 15), color: C.muted });
        // compteur qui roule de v1 à v2
        const roll = seg(t, PUT, PUT + 0.45, E.outCubic);
        ctx.save(); ctx.beginPath(); ctx.rect(RX + 24, JC[1] + 104, 220, 120); ctx.clip();
        txt(ctx, `v${D.versions[0].version}`, RX + 24, JC[1] + 164 - roll * 120, { font: FI(600, 104), color: C.ink, ls: -3 });
        txt(ctx, `v${D.versions[1].version}`, RX + 24, JC[1] + 164 + (1 - roll) * 120, { font: FI(600, 104), color: C.accent, ls: -3 });
        ctx.restore();
        const pa = pulse(t, PUT - 0.1, 0.8);
        pill(ctx, RX + RW - 28, JC[1] + 110, 'store.put(screen)', { align: 'right', font: FM(500, 15), bg: pa > 0.05 ? mix('#FFFFFF', C.accentSoft, pa) : '#FFFFFF', bd: pa > 0.05 ? C.accent : C.line, color: pa > 0.05 ? C.accent : C.muted, h: 34, r: 8 });
        txt(ctx, 'contentHash(screen)', RX + 28, JC[1] + 262, { font: FI(400, 15), color: C.muted });
        const h = t < PUT + 0.2 ? D.versions[0].hash : D.versions[1].hash;
        txt(ctx, h, RX + 28, JC[1] + 296, { font: FM(600, 26), color: t < PUT + 0.2 ? C.ink : C.accent });
        txt(ctx, 'FNV-1a · contenu sans version ni date', RX + RW - 28, JC[1] + 298, { font: FI(400, 13), color: C.faint, align: 'right' });
      });
      const facts = [['validateScreen', 'validé à la réception'], ['contentHash', 'appareils divergents repérés'], ['createMergePatch', 'mise à jour par patch']];
      alpha(ctx, seg(t, 15.8, 16.3), () => {
        card(ctx, RX, JC[1] + 360, RW, 230);
        facts.forEach(([api, what], i) => {
          const y = JC[1] + 360 + 52 + i * 64;
          alpha(ctx, seg(t, 16.0 + i * 0.25, 16.4 + i * 0.25), () => {
            ctx.beginPath(); ctx.arc(RX + 40, y, 13, 0, Math.PI * 2); ctx.fillStyle = C.okSoft; ctx.fill(); check(ctx, RX + 40, y, 11, C.ok, 2);
            txt(ctx, api, RX + 66, y - 10, { font: FM(500, 16), color: C.ink });
            txt(ctx, what, RX + 66, y + 14, { font: FI(400, 15), color: C.muted });
          });
        });
      });
      ctx.restore();
    });
  }

  /* ───────────────────────── 03 Routes dynamiques 0:22–0:30 ───────────────────────── */
  const RC = [96, 196, 780, 720];
  const ROW0 = RC[1] + 158, ROWH = 66;
  const ROUTES = D.router.table; // ordre de correspondance réel : /accueil, /tableaux/ventes, /mur/:position, /screens/:screenId
  const R_ADD = [22.55, 23.3, 24.05];
  const REMOVE = 27.5;
  const BR = [[920, 330], [1392, 330]]; const BW = 432, BH = 243;
  function routeRows(t) {
    // hauteur de chaque ligne (apparition, retrait)
    const hs = ROUTES.map((r, i) => (i < 3 ? seg(t, R_ADD[i] - 0.05, R_ADD[i] + 0.35, E.outCubic) : 1));
    hs[2] *= 1 - seg(t, REMOVE + 0.35, REMOVE + 0.75, E.inOutCubic);
    let y = ROW0; return hs.map((h) => { const r = { y, h }; y += ROWH * h; return r; });
  }
  function drawRoutes(ctx, t) {
    if (t < 21.4 || t > 30.5) return;
    const A = seg(t, 21.95, 22.45) * (1 - seg(t, 29.7, 30.3));
    const rows = routeRows(t);
    alpha(ctx, A, () => {
      const dx = (1 - seg(t, 21.95, 22.7, E.outExpo)) * 30;
      ctx.save(); ctx.translate(dx, 0);
      card(ctx, ...RC);
      txt(ctx, 'ScreenRouter', RC[0] + 32, RC[1] + 44, { font: FI(600, 24) });
      txt(ctx, 'createScreenRouter({ adapter: hashRouter() })', RC[0] + 32, RC[1] + 78, { font: FM(400, 15), color: C.muted });
      txt(ctx, 'MOTIF', RC[0] + 32, RC[1] + 128, { font: FM(500, 12), color: C.faint, ls: 1.5 });
      txt(ctx, 'ÉCRAN', RC[0] + 430, RC[1] + 128, { font: FM(500, 12), color: C.faint, ls: 1.5 });
      hl(ctx, RC[0] + 24, RC[0] + RC[2] - 24, RC[1] + 146, C.line);
      // ligne active : le panneau bleu devenu sélection de route
      const act = t < 25.5 ? 0 : 2;
      const toRow = seg(t, 25.5, 25.9, E.inOutCubic);
      const ay = t < 25.5 ? rows[0].y : lerp(rows[0].y, rows[2].y, toRow);
      const actA = (t < 22.3 ? 0 : 1) * (1 - seg(t, REMOVE, REMOVE + 0.35));
      if (actA > 0 && t >= 22.3) alpha(ctx, actA, () => { rr(ctx, RC[0] + 20, ay + 6, RC[2] - 40, ROWH - 12, 8); ctx.fillStyle = C.accentSoft; ctx.fill(); ctx.fillStyle = C.accent; ctx.fillRect(RC[0] + 20, ay + 6, 4, ROWH - 12); });
      ROUTES.forEach((r, i) => {
        const { y, h } = rows[i]; if (h < 0.02) return;
        const builtin = r.id === 'multi-screen:screen';
        const strike = i === 2 ? seg(t, REMOVE, REMOVE + 0.3) : 0;
        alpha(ctx, (builtin ? 1 : h) * (i === 2 ? 1 - seg(t, REMOVE + 0.25, REMOVE + 0.6) : 1), () => {
          const cy = y + ROWH / 2;
          ctx.save(); ctx.beginPath(); ctx.rect(RC[0], y, RC[2], ROWH * h); ctx.clip();
          txt(ctx, r.path, RC[0] + 40, cy, { font: FM(500, 22), color: builtin ? C.faint : C.ink });
          txt(ctx, '→', RC[0] + 392, cy, { font: FI(400, 20), color: C.faint });
          pill(ctx, RC[0] + 430, cy, r.screenId ?? ':screenId', { align: 'left', font: FM(500, 16), bg: builtin ? '#F4F5F7' : '#FFFFFF', bd: C.line, color: builtin ? C.faint : C.ink, h: 32, r: 6 });
          if (builtin) txt(ctx, `priorité ${String(r.priority).replace('-', '−')}`, RC[0] + RC[2] - 32, cy, { font: FM(400, 14), color: C.faint, align: 'right' });
          else { const a = pulse(t, R_ADD[i], 0.9); if (a > 0.02) pill(ctx, RC[0] + RC[2] - 32, cy, 'ajoutée', { align: 'right', font: FI(500, 13), bg: C.okSoft, color: C.ok, h: 26, pad: 10 }); }
          if (strike > 0) hl(ctx, RC[0] + 36, RC[0] + 36 + (RC[2] - 72) * strike, cy, C.ko, 2);
          if (i < 3) hl(ctx, RC[0] + 24, RC[0] + RC[2] - 24, y + ROWH - 0.5, C.soft);
          ctx.restore();
        });
      });
      // la ligne de code courante
      const code = t < R_ADD[1] - 0.3 ? `router.addRoute({ path: '/accueil', screenId: 'accueil' })`
        : t < R_ADD[2] - 0.3 ? `router.addRoute({ path: '/tableaux/ventes', screenId: 'ventes' })`
          : t < REMOVE - 0.6 ? `router.addRoute({ path: '/mur/:position', screenId: 'mur' })` : `router.removeRoute('/mur/:position')`;
      const t0 = t < R_ADD[1] - 0.3 ? 22.2 : t < R_ADD[2] - 0.3 ? R_ADD[1] - 0.3 : t < REMOVE - 0.6 ? R_ADD[2] - 0.3 : REMOVE - 0.6;
      rr(ctx, RC[0] + 24, RC[1] + RC[3] - 84, RC[2] - 48, 56, 8); ctx.fillStyle = C.bg; ctx.fill();
      txt(ctx, '›', RC[0] + 42, RC[1] + RC[3] - 56, { font: FM(600, 17), color: C.accent });
      txt(ctx, typed(code, inv(t0, t0 + 0.45, t)), RC[0] + 62, RC[1] + RC[3] - 56, { font: FM(400, 15.5), color: C.ink });
      ctx.restore();
      // navigateurs
      const addrA = t < 24.75 ? 'device.html#/accueil' : t < 25.4 ? 'device.html#' + typed('/mur/gauche', inv(24.8, 25.35, t)) : 'device.html#/mur/gauche';
      const empty = t >= REMOVE + 0.3;
      const bodyA = (x, y, w, h) => {
        if (empty) emptyScreen(ctx, x, y, w, h, 'Aucun écran pour /mur/gauche', 1);
        else if (t < 25.45) drawComp(ctx, x, y, w, h, { th: DV.light, u: 0.58, t, value: 128400, textSize: 30 });
        else drawMur(ctx, x, y, w, h);
      };
      const bodyB = (x, y, w, h) => (empty ? emptyScreen(ctx, x, y, w, h, 'Aucun écran pour /mur/droite', 1) : drawMur(ctx, x, y, w, h));
      // liens pointillés de la route vers les navigateurs
      const linkA = seg(t, 25.5, 25.9) * (1 - seg(t, REMOVE, REMOVE + 0.3));
      const linkB = seg(t, 26.0, 26.4) * (1 - seg(t, REMOVE, REMOVE + 0.3));
      const from = [RC[0] + RC[2] + dx, rows[2].y + ROWH / 2];
      const matchY0 = BR[0][1] + BH + 42 + 44;
      dashed(ctx, bez(from, [BR[0][0] + BW / 2, matchY0 - 18]), linkA, C.accent, { w: 1.6 });
      dashed(ctx, bez(from, [BR[1][0] + BW / 2, matchY0 - 18]), linkB, C.accent, { w: 1.6 });
      const aA = seg(t, 22.45, 22.95), aB = seg(t, 25.75, 26.25);
      const lift = (a) => (1 - a) * 20;
      ctx.save(); ctx.translate(0, lift(aA)); browser(ctx, BR[0][0], BR[0][1], BW, BH, addrA, aA, bodyA); ctx.restore();
      ctx.save(); ctx.translate(0, lift(aB)); browser(ctx, BR[1][0], BR[1][1], BW, BH, 'device.html#/mur/droite', aB, bodyB); ctx.restore();
      // résultat de la correspondance sous chaque navigateur
      const matchY = BR[0][1] + BH + 42 + 44;
      const m = D.router.before;
      const chip = (x, a, mm, i) => alpha(ctx, a, () => {
        if (empty) { pill(ctx, x, matchY, 'aucune route ne correspond', { font: FM(500, 15), color: C.muted, bg: '#FFFFFF', bd: C.line, h: 34, r: 8 }); return; }
        const lab = t < 25.45 && i === 0 ? 'accueil · {}' : `${mm.screenId} · { position: "${mm.params.position}" }`;
        pill(ctx, x, matchY, lab, { font: FM(500, 15), color: C.accent, bg: C.accentSoft, bd: C.accentLine, h: 34, r: 8 });
      });
      chip(BR[0][0] + BW / 2, aA, m[0], 0); chip(BR[1][0] + BW / 2, aB, m[1], 1);
      txt(ctx, 'useRouteMatch · router.current', BR[0][0], matchY + 50, { font: FM(400, 13), color: C.faint });
      // instantané : l'écran affiché suit le retrait
      const flash = pulse(t, REMOVE + 0.3, 0.5);
      if (flash > 0.02) [0, 1].forEach((i) => { rr(ctx, BR[i][0] - 4, BR[i][1] - 4, BW + 8, BH + 50, 15); ctx.strokeStyle = rgba(C.ko, 0.5 * flash); ctx.lineWidth = 3; ctx.stroke(); });
    });
    // le panneau bleu arrive de la ligne "route" du JSON
    if (t > 21.4 && t < 22.6) {
      const k = seg(t, 21.55, 22.35, E.inOutCubic);
      const { ly } = jsonGeom(t);
      const from = [JC[0] + 24 - 120 * seg(t, 21.5, 22.3, E.inOutCubic), ly(J_ROUTE) - JLH / 2, JC[2] - 48, JLH];
      const to = [RC[0] + 20, ROW0 + 6, RC[2] - 40, ROWH - 12];
      const r = lr(from, to, k);
      alpha(ctx, 1 - seg(t, 22.3, 22.6), () => { rr(ctx, ...r, 8); ctx.fillStyle = mix(C.accent, C.accentSoft, seg(t, 22.0, 22.45)); ctx.fill(); });
    }
  }

  /* ───────────────────────── 04 Diffuser 0:30–0:40 ───────────────────────── */
  const RG = [96, 186, 540, 812];
  const DEV = {
    tv: { s: [880, 206, 520, 292], name: 'Hall', tags: '#hall', label: [1416, 222], item: 0 },
    borne: { s: [1514, 556, 300, 169], name: 'Borne d’accueil', tags: '#hall', label: [1514, 518], item: 1 },
    tab: { s: [960, 700, 368, 230], name: 'Bureau', tags: '#bureau', label: [1346, 716], item: 2 },
  };
  const itemY = (i) => RG[1] + 150 + i * 104;
  const HELLO = [30.65, 30.8, 30.95], SEND = 32.0, SHOW1 = 33.0, ACK1 = 33.85, UPD = 34.95, PATCH1 = 35.75, ACK2 = 36.55;
  const linkOf = (d) => { const it = itemY(d.item) + 46; const s = d.s; return bez([RG[0] + RG[2] + 2, it], [s[0] - 16, s[1] + s[3] / 2], 0.55); };
  function deviceContent(ctx, key, x, y, w, h, t) {
    const shown = t >= SHOW1 && (key === 'tv' || key === 'borne');
    if (!shown) {
      ctx.fillStyle = '#111418'; ctx.fillRect(x, y, w, h);
      const nm = DEV[key].name;
      txt(ctx, `${nm} attend un écran…`, x + w / 2, y + h / 2, { font: FI(400, Math.max(11, w / 30)), color: '#8B949E', align: 'center' });
      return;
    }
    const a = seg(t, SHOW1, SHOW1 + 0.35);
    ctx.fillStyle = '#111418'; ctx.fillRect(x, y, w, h);
    alpha(ctx, a, () => drawComp(ctx, x, y, w, h, { th: DV.light, u: w / 900, t, value: t < PATCH1 ? 128400 : 131900, flash: pulse(t, PATCH1, 0.9), textSize: 30 }));
  }
  function patchLines() {
    const j = JSON.stringify(D.wire.patch.payload.patch); const cut = j.indexOf('{"params"');
    return [j.slice(0, cut), '  ' + j.slice(cut)];
  }
  function drawBroadcast(ctx, t) {
    if (t < 29.6 || t > 40.4) return;
    const A = seg(t, 29.8, 30.4);
    const outOthers = seg(t, 39.2, 39.8);
    alpha(ctx, A, () => {
      // régie
      alpha(ctx, 1 - outOthers, () => {
        const dx = (1 - seg(t, 29.8, 30.6, E.outExpo)) * -24;
        ctx.save(); ctx.translate(dx, 0);
        card(ctx, ...RG);
        txt(ctx, 'Régie', RG[0] + 28, RG[1] + 42, { font: FI(600, 26) });
        txt(ctx, 'BroadcastChannel (même navigateur)', RG[0] + 28 + tw(ctx, 'Régie', FI(600, 26)) + 16, RG[1] + 44, { font: FI(400, 14), color: C.muted });
        hl(ctx, RG[0], RG[0] + RG[2], RG[1] + 76, C.line);
        txt(ctx, 'ÉCRANS CONNECTÉS', RG[0] + 28, RG[1] + 112, { font: FI(600, 13), color: C.muted, ls: 1 });
        const order = ['tv', 'borne', 'tab'];
        order.forEach((key, i) => {
          const d = DEV[key]; const y = itemY(i); const on = t >= HELLO[i] + 0.55;
          const targeted = t >= SEND && key !== 'tab';
          alpha(ctx, seg(t, 30.0 + i * 0.08, 30.4 + i * 0.08), () => {
            rr(ctx, RG[0] + 24, y, RG[2] - 48, 92, 10); ctx.fillStyle = targeted ? '#FBFCFF' : '#FFFFFF'; ctx.fill();
            ctx.strokeStyle = targeted ? C.accent : C.line; ctx.lineWidth = targeted ? 1.5 : 1; ctx.stroke();
            ctx.beginPath(); ctx.arc(RG[0] + 50, y + 30, 6, 0, Math.PI * 2); ctx.fillStyle = on ? C.ok : C.ko; ctx.fill();
            if (on) { const p = pulse(t, HELLO[i] + 0.55, 0.6); if (p > 0.02) { ctx.beginPath(); ctx.arc(RG[0] + 50, y + 30, 6 + 10 * p, 0, Math.PI * 2); ctx.strokeStyle = rgba(C.ok, 0.4 * (1 - p)); ctx.lineWidth = 2; ctx.stroke(); } }
            txt(ctx, d.name, RG[0] + 66, y + 30, { font: FI(600, 19) });
            rr(ctx, RG[0] + RG[2] - 152, y + 14, 100, 34, 6); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
            txt(ctx, 'Identifier', RG[0] + RG[2] - 102, y + 31.5, { font: FI(400, 14), align: 'center', color: on ? C.ink : C.faint });
            const has = (key === 'tv' || key === 'borne') && t >= SHOW1 + 0.3;
            const vp = { tv: '1920×1080', borne: '1080×1920', tab: '1280×800' }[key];
            const meta = `${has ? 'Accueil' : 'aucun écran'} · ${has ? '/accueil' : '/'} · ${vp} · ${d.tags}`;
            txt(ctx, meta, RG[0] + 44, y + 66, { font: FI(400, 14), color: C.muted });
            // accusés de réception
            const ack = key !== 'tab' ? Math.max(seg(t, ACK1 + 0.55, ACK1 + 0.8) * (1 - seg(t, UPD - 0.2, UPD)), seg(t, ACK2 + 0.55, ACK2 + 0.8)) : 0;
            if (ack > 0.01) alpha(ctx, ack, () => { ctx.beginPath(); ctx.arc(RG[0] + RG[2] - 176, y + 31, 13, 0, Math.PI * 2); ctx.fillStyle = C.okSoft; ctx.fill(); check(ctx, RG[0] + RG[2] - 176, y + 31, 11, C.ok, 2.2); });
          });
        });
        const fy = RG[1] + 478;
        txt(ctx, 'Étiquette', RG[0] + 28, fy + 19, { font: FI(400, 16) });
        rr(ctx, RG[0] + 150, fy, 170, 38, 6); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = t > 31.3 && t < SEND ? C.accent : C.line; ctx.lineWidth = 1; ctx.stroke();
        txt(ctx, 'hall', RG[0] + 162, fy + 19.5, { font: FI(400, 16) });
        const bp = pulse(t, SEND - 0.05, 0.3);
        rr(ctx, RG[0] + 28, fy + 58 + bp * 2, 120, 42, 7); ctx.fillStyle = mix(C.accent, '#1F55B8', bp); ctx.fill();
        txt(ctx, 'Envoyer', RG[0] + 88, fy + 79.5 + bp * 2, { font: FI(500, 16), color: '#fff', align: 'center' });
        pill(ctx, RG[0] + 164, fy + 79, 'tag:hall', { align: 'left', font: FM(500, 15), bg: C.accentSoft, color: C.accent, h: 30, r: 6 });
        const status = t < ACK1 + 0.6 ? '' : t < ACK2 + 0.6 ? 'Envoi : 2 écran(s) OK' : 'Mise à jour : 2 écran(s) OK';
        if (status) txt(ctx, status, RG[0] + 28, fy + 132, { font: FI(400, 14.5), color: C.muted });
        // code
        const cy = RG[1] + 622;
        rr(ctx, RG[0] + 24, cy, RG[2] - 48, 166, 8); ctx.fillStyle = C.bg; ctx.fill();
        const code = t < UPD - 0.4
          ? [["await hub.show('tag:hall', 'accueil')", C.ink], ['// stocké, route /accueil créée, affiché', C.faint]]
          : [["await hub.update('accueil', …)", C.ink], ['// screen/patch → hall-tv, borne', C.faint], ...patchLines().map((l) => [l, C.accent])];
        const ct0 = t < UPD - 0.4 ? 31.4 : UPD - 0.4;
        code.forEach(([s, c], i) => txt(ctx, typed(s, inv(ct0 + Math.min(i, 2) * 0.25, ct0 + Math.min(i, 2) * 0.25 + 0.4, t)), RG[0] + 44, cy + 28 + i * 28, { font: FM(i >= 2 ? 500 : 400, 14.5), color: c }));
        if (t > ACK2 + 0.7) alpha(ctx, seg(t, ACK2 + 0.7, ACK2 + 1.1), () => txt(ctx, `patch : ${D.bytes.patch} o · écran complet : ${fr(D.bytes.screen)} o`, RG[0] + 44, cy + 28 + 4 * 28 + 4, { font: FI(500, 14), color: C.ink }));
        // pointeur
        const pp = along([[30.9, 560, 900], [31.25, RG[0] + 240, RG[1] + 497], [31.55, RG[0] + 240, RG[1] + 497], [31.9, RG[0] + 92, RG[1] + 556]], t);
        pointer(ctx, pp[0], pp[1], pulse(t, SEND - 0.08, 0.3), seg(t, 30.9, 31.1) * (1 - seg(t, 32.5, 32.8)));
        ctx.restore();
      });
      // liens et appareils
      for (const key of ['tv', 'borne', 'tab']) {
        const d = DEV[key]; const f = linkOf(d);
        const hall = key !== 'tab';
        const lk = seg(t, 30.2, 30.9);
        const col = hall && t >= SEND ? C.accent : C.faint;
        alpha(ctx, 1 - outOthers, () => dashed(ctx, f, lk, col, { w: hall && t >= SEND ? 1.8 : 1.4 }));
        // messages
        alpha(ctx, 1 - outOthers, () => {
          const hi = HELLO[d.item];
          packet(ctx, (u) => f(1 - u), inv(hi, hi + 0.55, t), 'device/hello', { bg: '#FFFFFF', color: C.muted, size: 12, h: 24 });
          if (hall) {
            packet(ctx, f, inv(SEND + 0.05, SHOW1, t), 'screen/show', { bg: C.accent, size: 13, h: 28 });
            packet(ctx, (u) => f(1 - u), inv(ACK1 - 0.05 + d.item * 0.1, ACK1 + 0.55 + d.item * 0.1, t), 'ack', { bg: C.ok, size: 13, h: 26 });
            packet(ctx, f, inv(UPD, PATCH1, t), null, { bg: C.accent, w: 18, hh: 12 });
            packet(ctx, (u) => f(1 - u), inv(PATCH1 + 0.2 + d.item * 0.1, ACK2 + 0.6 + d.item * 0.1, t), 'ack', { bg: C.ok, size: 13, h: 26 });
          }
        });
        // appareil
        const [sx, sy, sw, sh] = d.s;
        if (key === 'borne') continue; // dessinée par drawBorne (continuité avec le chapitre 05)
        alpha(ctx, seg(t, 30.0 + d.item * 0.1, 30.5 + d.item * 0.1) * (1 - outOthers), () => {
          bezel(ctx, sx, sy, sw, sh, { b: key === 'tab' ? 16 : 9, r: key === 'tab' ? 22 : 8 });
          if (key === 'tv') tvStand(ctx, sx, sy, sw, sh);
          screenClip(ctx, sx, sy, sw, sh, () => deviceContent(ctx, key, sx, sy, sw, sh, t));
          const arrive = pulse(t, key === 'tab' ? -9 : SHOW1, 0.6);
          if (arrive > 0.02) { rr(ctx, sx - 14, sy - 14, sw + 28, sh + 28, 14); ctx.strokeStyle = rgba(C.accent, 0.5 * arrive); ctx.lineWidth = 3; ctx.stroke(); }
          deviceLabel(ctx, d, t);
        });
      }
    });
  }
  function deviceLabel(ctx, d, t) {
    const [lx, ly] = d.label; const on = t >= HELLO[d.item] + 0.55;
    ctx.beginPath(); ctx.arc(lx + 6, ly, 5, 0, Math.PI * 2); ctx.fillStyle = on ? C.ok : C.ko; ctx.fill();
    txt(ctx, d.name, lx + 20, ly, { font: FI(600, 17) });
    txt(ctx, d.tags, lx + 20 + tw(ctx, d.name, FI(600, 17)) + 10, ly, { font: FM(500, 14), color: C.muted });
  }

  /* ───────────────────────── 05 Régler l'affichage 0:40–0:48 ───────────────────────── */
  const BCX = 640, BCY = 560;
  const B_BIG = [BCX - 360, BCY - 202.5, 720, 405]; // borne agrandie, paysage
  const PIVOT = 40.3, ROT = 41.5, TH1 = 42.6, TH2 = 43.85, HIDE = 45.0, LOCK = 45.6, IDENT = 46.4;
  function drawBorne(ctx, t) {
    if (t < 29.6 || t > 48.6) return;
    const d = DEV.borne;
    const A = seg(t, 30.1, 30.6) * (1 - seg(t, 47.8, 48.4));
    const move = seg(t, 39.3, 40.2, E.inOutCubic);
    const r = lr(d.s, B_BIG, move);
    const piv = seg(t, PIVOT, PIVOT + 0.85, E.inOutCubic);
    const cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2;
    alpha(ctx, A, () => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((Math.PI / 2) * piv);
      const w = r[2], h = r[3];
      bezel(ctx, -w / 2, -h / 2, w, h, { b: lerp(9, 14, move), r: lerp(8, 14, move) });
      // contenu : tourne avec l'écran, puis display.rotation le redresse et la résolution 1080×1920 le recompose
      const fix = seg(t, ROT, ROT + 0.8, E.inOutCubic);
      screenClip(ctx, -w / 2, -h / 2, w, h, () => {
        ctx.fillStyle = '#111418'; ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.save(); ctx.rotate(-(Math.PI / 2) * fix);
        const sw = lerp(w, h, fix), sh = lerp(h, w, fix);
        drawBorneStage(ctx, -sw / 2, -sh / 2, sw, sh, t);
        ctx.restore();
      });
      ctx.restore();
      if (move < 0.01 && t < 39.4) deviceLabel(ctx, d, t);
    });
  }
  function drawBorneStage(ctx, x, y, w, h, t) {
    if (t < SHOW1) { deviceContent(ctx, 'borne', x, y, w, h, t); return; }
    const u = Math.min(w, h) / (t < 39 ? 520 : 470);
    const tabs = 1 - seg(t, HIDE, HIDE + 0.4, E.inOutCubic);
    const base = { u, t, tabs, value: t < PATCH1 ? 128400 : 131900, flash: t < 39 ? pulse(t, PATCH1, 0.9) : 0, textSize: 30 };
    const a = seg(t, SHOW1, SHOW1 + 0.35);
    alpha(ctx, a, () => {
      // volets de thème
      const wipe = (t0, A, B) => {
        const k = seg(t, t0, t0 + 0.7, E.inOutCubic);
        if (k <= 0) return false;
        drawComp(ctx, x, y, w, h, { ...base, th: A });
        if (k >= 1) return false;
        const wx = x + (w + 40) * k - 20;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, wx - x, h); ctx.clip(); drawComp(ctx, x, y, w, h, { ...base, th: B }); ctx.restore();
        const g = ctx.createLinearGradient(wx - 50, 0, wx, 0); g.addColorStop(0, rgba(C.accent, 0)); g.addColorStop(1, rgba(C.accent, 0.35)); ctx.fillStyle = g; ctx.fillRect(wx - 50, y, 50, h);
        vl(ctx, wx, y, y + h, C.accent, 3);
        return true;
      };
      if (t < TH1) drawComp(ctx, x, y, w, h, { ...base, th: DV.light });
      else if (t < TH1 + 0.7) wipe(TH1, DV.light, DV.abyss);
      else if (t < TH2) drawComp(ctx, x, y, w, h, { ...base, th: DV.abyss });
      else if (t < TH2 + 0.7) wipe(TH2, DV.abyss, DV.dracula);
      else drawComp(ctx, x, y, w, h, { ...base, th: DV.dracula });
    });
    // verrou
    const lk = seg(t, LOCK, LOCK + 0.35, E.outBack);
    if (lk > 0.01 && t > 44) alpha(ctx, Math.min(1, lk), () => {
      const lx = x + w - 34, ly = y + 34;
      ctx.beginPath(); ctx.arc(lx, ly, 20 * lk, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
      padlock(ctx, lx, ly - 2, 20 * lk, '#282A36');
    });
    // identification
    const id = seg(t, IDENT, IDENT + 0.2);
    if (id > 0.01) alpha(ctx, id, () => {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, y, w, h);
      const size = Math.min(w, h) * 0.13;
      txt(ctx, 'Borne', x + w / 2, y + h / 2 - size * 0.62, { font: FI(600, size), color: '#fff', align: 'center' });
      txt(ctx, 'd’accueil', x + w / 2, y + h / 2 + size * 0.62, { font: FI(600, size), color: '#fff', align: 'center' });
    });
  }
  function drawDisplayPanel(ctx, t) {
    if (t < 39.3 || t > 48.6) return;
    const A = seg(t, 39.8, 40.4) * (1 - seg(t, 47.8, 48.3));
    // pied de borne et cotes
    const piv = seg(t, PIVOT + 0.5, PIVOT + 1.0);
    const sx = BCX, top = BCY + 360, bottom = 1010;
    alpha(ctx, A * piv, () => {
      ctx.fillStyle = '#2B3038'; ctx.fillRect(sx - 14, top + 14, 28, bottom - top - 30); rr(ctx, sx - 110, bottom - 20, 220, 14, 7); ctx.fill();
    });
    const dim = seg(t, ROT + 0.8, ROT + 1.2);
    alpha(ctx, A * dim, () => {
      const x0 = BCX - 202.5, x1 = BCX + 202.5, y0 = BCY - 360, y1 = BCY + 360;
      const gx = x1 + 44;
      vl(ctx, gx, y0, y1, C.faint); hl(ctx, gx - 6, gx + 6, y0, C.faint); hl(ctx, gx - 6, gx + 6, y1, C.faint);
      ctx.save(); ctx.translate(gx + 22, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); txt(ctx, '1920', 0, 0, { font: FM(500, 15), color: C.muted, align: 'center' }); ctx.restore();
      const gy = y0 - 30; hl(ctx, x0, x1, gy, C.faint); vl(ctx, x0, gy - 6, gy + 6, C.faint); vl(ctx, x1, gy - 6, gy + 6, C.faint);
      txt(ctx, '1080', BCX, gy - 16, { font: FM(500, 15), color: C.muted, align: 'center' });
    });
    // journal des commandes
    const LX = 1080, LW = 744;
    const LOG = [
      [ROT - 0.2, ["hub.setDisplay('borne', {", "  rotation: 90, resolution: { width: 1080, height: 1920 } })"]],
      [TH1 - 0.15, ["hub.setTheme('borne', { base: 'abyss' })"]],
      [TH2 - 0.15, ["hub.setTheme('borne', { base: 'dracula' })"]],
      [HIDE - 0.15, ["hub.setDisplay('borne', { hideTabs: true, locked: true },", '  { merge: true })']],
      [IDENT - 0.15, ["hub.identify('borne')"]],
    ];
    alpha(ctx, A, () => {
      const dx = (1 - seg(t, 39.8, 40.6, E.outExpo)) * 30;
      ctx.save(); ctx.translate(dx, 0);
      card(ctx, LX, 186, LW, 400);
      txt(ctx, 'Régie → Borne d’accueil', LX + 28, 218, { font: FM(600, 15), color: C.accent, ls: 0.5 });
      txt(ctx, 'surcharges par appareil', LX + LW - 28, 218, { font: FI(400, 14), color: C.muted, align: 'right' });
      hl(ctx, LX, LX + LW, 238, C.line);
      let y = 272;
      LOG.forEach(([t0, lines], i) => {
        const a = seg(t, t0, t0 + 0.25);
        if (a <= 0) return;
        const cur = i === LOG.length - 1 || t < LOG[i + 1][0];
        alpha(ctx, a, () => {
          if (cur) { rr(ctx, LX + 18, y - 17, LW - 36, lines.length * 28 + 6, 6); ctx.fillStyle = C.accentSoft; ctx.fill(); ctx.fillStyle = C.accent; ctx.fillRect(LX + 18, y - 17, 3, lines.length * 28 + 6); }
          lines.forEach((s, j) => txt(ctx, typed(s, inv(t0, t0 + 0.35, t)), LX + 34, y + j * 28, { font: FM(400, 15), color: C.ink }));
          const ok = seg(t, t0 + 0.45, t0 + 0.6);
          if (ok > 0) alpha(ctx, ok, () => { check(ctx, LX + LW - 40, y, 11, C.ok, 2.2); });
        });
        y += lines.length * 28 + 14;
      });
      ctx.restore();
      // carte des variables du thème courant
      const th = t < TH1 + 0.35 ? DV.light : t < TH2 + 0.35 ? DV.abyss : DV.dracula;
      const prev = t < TH1 + 0.35 ? null : t < TH2 + 0.35 ? DV.light : DV.abyss;
      const ta = seg(t, TH1 - 0.6, TH1 - 0.2);
      alpha(ctx, ta, () => {
        ctx.save(); ctx.translate(dx, 0);
        card(ctx, LX, 616, LW, 300);
        const sw = t >= TH1 && t < TH1 + 0.7 ? seg(t, TH1, TH1 + 0.7, E.inOutCubic) : t >= TH2 && t < TH2 + 0.7 ? seg(t, TH2, TH2 + 0.7, E.inOutCubic) : 1;
        const drawVars = (T) => {
          txt(ctx, `.${T.cls} {`, LX + 28, 652, { font: FM(600, 15), color: C.ink });
          T.vars.forEach(([k, v, hex], i) => {
            const y = 696 + i * 44;
            rr(ctx, LX + 30, y - 12, 24, 24, 5); ctx.fillStyle = hex; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
            txt(ctx, `${k}:`, LX + 68, y, { font: FM(400, 13), color: C.muted });
            txt(ctx, `${v};`, LX + LW - 28, y, { font: FM(500, 13), color: C.ink, align: 'right' });
          });
          txt(ctx, '}', LX + 28, 880, { font: FM(600, 15), color: C.ink });
        };
        if (sw < 1 && prev) {
          const wx = LX + LW * sw;
          ctx.save(); ctx.beginPath(); ctx.rect(wx, 616, LX + LW - wx, 300); ctx.clip(); drawVars(prev); ctx.restore();
          ctx.save(); ctx.beginPath(); ctx.rect(LX, 616, wx - LX, 300); ctx.clip(); drawVars(th); ctx.restore();
          vl(ctx, wx, 620, 912, C.accent, 3);
        } else drawVars(th);
        txt(ctx, `theme.base : '${th.name}' · valeurs calculées`, LX + LW - 28, 652, { font: FM(500, 14), color: C.accent, align: 'right' });
        ctx.restore();
      });
    });
  }

  /* ───────────────────────── 06 Partout 0:48–0:54 ───────────────────────── */
  const PC = [[96, 186], [682, 186], [1268, 186]]; const PCW = 556, PCH = 452;
  const PL = [96, 668, 1728, 330];
  function drawEverywhere(ctx, t) {
    if (t < 47.6 || t > 55.2) return;
    const gather = seg(t, 53.55, 54.5, E.inOutCubic);
    const A = 1 - seg(t, 54.0, 54.6);
    const items = [
      ['Même navigateur', 'broadcastChannelTransport()', 'Onglets et fenêtres d’un navigateur'],
      ['Réseau', 'webSocketTransport({ url })', 'Écrans répartis, une salle par site'],
      ['Lien de partage', 'createShareUrl(screen)', 'L’écran entier dans l’URL, sans serveur'],
    ];
    alpha(ctx, A, () => {
      items.forEach(([title, api, note], i) => {
        const a = seg(t, 48.1 + i * 0.15, 48.6 + i * 0.15);
        const [x, y0] = PC[i]; const y = y0 + (1 - seg(t, 48.1 + i * 0.15, 48.9 + i * 0.15, E.outExpo)) * 24;
        alpha(ctx, a * (1 - gather), () => {
          card(ctx, x, y, PCW, PCH);
          txt(ctx, String.fromCharCode(65 + i), x + 28, y + 38, { font: FM(600, 15), color: C.accent });
          txt(ctx, title, x + 52, y + 38, { font: FI(600, 24) });
          txt(ctx, api, x + 28, y + 76, { font: FM(500, 16), color: C.accent });
          hl(ctx, x, x + PCW, y + 100, C.line);
          txt(ctx, note, x + 28, y + PCH - 30, { font: FI(400, 15), color: C.muted });
          const ix = x + 28, iy = y + 120, iw = PCW - 56, ih = PCH - 190;
          if (i === 0) illusBroadcast(ctx, ix, iy, iw, ih, t);
          if (i === 1) illusRelay(ctx, ix, iy, iw, ih, t);
          if (i === 2) illusShare(ctx, ix, iy, iw, ih, t);
        });
      });
      // playlist sur le téléviseur
      const pa = seg(t, 49.0, 49.5);
      alpha(ctx, pa * (1 - gather), () => {
        const [x, y, w, h] = PL;
        card(ctx, x, y, w, h);
        const tx = x + 56, ty = y + 44, tw_ = 420, th_ = 236;
        bezel(ctx, tx, ty, tw_, th_, { b: 8, r: 8 });
        const P0 = 49.6, DUR = 2.0;
        const idx = Math.floor(Math.max(0, t - P0) / DUR) % 2;
        screenClip(ctx, tx, ty, tw_, th_, () => {
          if (idx === 0) drawComp(ctx, tx, ty, tw_, th_, { th: DV.light, u: tw_ / 900, t, value: 131900, textSize: 30 });
          else drawVentes(ctx, tx, ty, tw_, th_, tw_ / 900);
        });
        const lx = tx + tw_ + 64;
        txt(ctx, 'Playlist', lx, y + 58, { font: FI(600, 24) });
        txt(ctx, 'createPlaylist({ router: device.router, items })', lx + 112, y + 60, { font: FM(500, 16), color: C.accent });
        const list = [['accueil', 'Accueil'], ['ventes', 'Tableau des ventes']];
        list.forEach(([id, title], j) => {
          const ry = y + 104 + j * 72; const active = idx === j && t >= P0;
          rr(ctx, lx, ry, 980, 58, 8); ctx.fillStyle = active ? C.accentSoft : '#FFFFFF'; ctx.fill(); ctx.strokeStyle = active ? C.accentLine : C.line; ctx.lineWidth = 1; ctx.stroke();
          txt(ctx, `{ screenId: '${id}', durationMs: 2000 }`, lx + 22, ry + 29, { font: FM(400, 16), color: active ? C.accent : C.ink });
          txt(ctx, title, lx + 600, ry + 29, { font: FI(400, 16), color: C.muted });
          if (active) { const k = ((t - P0) % DUR) / DUR; rr(ctx, lx + 760, ry + 25, 196, 8, 4); ctx.fillStyle = '#FFFFFF'; ctx.fill(); rr(ctx, lx + 760, ry + 25, 196 * k, 8, 4); ctx.fillStyle = C.accent; ctx.fill(); }
        });
        txt(ctx, 'Pilotée depuis la régie : hub.command(\'tag:hall\', \'playlist\', items)', lx, y + 278, { font: FM(400, 14.5), color: C.muted });
      });
    });
  }
  function miniWindow(ctx, x, y, w, h, title, body) {
    rr(ctx, x, y, w, h, 8); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
    hl(ctx, x, x + w, y + 24, C.line); txt(ctx, title, x + 10, y + 12.5, { font: FI(500, 12), color: C.muted });
    ctx.save(); ctx.beginPath(); ctx.rect(x + 1, y + 25, w - 2, h - 26); ctx.clip(); body(x + 1, y + 25, w - 2, h - 26); ctx.restore();
  }
  function illusBroadcast(ctx, x, y, w, h, t) {
    rr(ctx, x, y, w, h, 10); ctx.fillStyle = C.bg; ctx.fill();
    const ww = 190, wh = 150; const ax = x + 22, bx = x + w - 22 - ww, wy = y + (h - wh) / 2;
    miniWindow(ctx, ax, wy, ww, wh, 'Régie', (bx_, by, bw, bh) => { [0, 1, 2].forEach((i) => { ctx.fillStyle = i === 0 ? C.accentSoft : C.soft; rr(ctx, bx_ + 10, by + 10 + i * 34, bw - 20, 26, 5); ctx.fill(); }); });
    miniWindow(ctx, bx, wy, ww, wh, 'Écran', (bx_, by, bw, bh) => drawComp(ctx, bx_, by, bw, bh, { th: DV.light, u: 0.22, t, value: 131900, textSize: 30 }));
    const f = bez([ax + ww + 4, wy + wh / 2], [bx - 4, wy + wh / 2]);
    dashed(ctx, f, 1, C.accent, { w: 1.6 });
    for (let k = 0; k < 3; k++) { const u = ((t - 48.4 + k * 0.45) % 1.35) / 1.35; if (t > 48.4) packet(ctx, k % 2 ? (q) => f(1 - q) : f, u, null, { bg: k % 2 ? C.ok : C.accent, w: 14, hh: 10 }); }
    txt(ctx, 'BroadcastChannel', x + w / 2, wy - 16, { font: FM(500, 13), color: C.muted, align: 'center' });
  }
  function illusRelay(ctx, x, y, w, h, t) {
    rr(ctx, x, y, w, h, 10); ctx.fillStyle = C.bg; ctx.fill();
    rr(ctx, x + 14, y + 14, w - 28, 38, 7); ctx.fillStyle = C.ink; ctx.fill();
    txt(ctx, typed('$ npx multi-screen-relay --port 8787', inv(48.6, 49.4, t)), x + 28, y + 33.5, { font: FM(500, 14.5), color: '#E6EDF3' });
    const cx = x + w / 2, cy = y + 52 + (h - 52) / 2;
    const pts = [[x + 70, cy - 30], [x + w - 70, cy - 30], [cx, y + h - 26]];
    pts.forEach((p, i) => {
      const f = bez([cx, cy], p, 0.3); dashed(ctx, f, seg(t, 48.9, 49.4), C.accent, { w: 1.5 });
      if (t > 49.2) packet(ctx, f, ((t - 49.2 + i * 0.35) % 1.2) / 1.2, null, { bg: C.accent, w: 12, hh: 9 });
      rr(ctx, p[0] - 34, p[1] - 21, 68, 42, 5); ctx.fillStyle = C.bezel; ctx.fill(); rr(ctx, p[0] - 30, p[1] - 17, 60, 34, 2); ctx.fillStyle = i === 1 ? '#000C18' : '#FFFFFF'; ctx.fill();
      ctx.fillStyle = C.accent; ctx.fillRect(p[0], p[1] - 17, 30, 34);
    });
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
    txt(ctx, 'relais', cx, cy, { font: FM(500, 12), color: C.accent, align: 'center' });
    txt(ctx, 'ws://hôte:8787/?room=magasin-12', cx, cy + 50, { font: FM(400, 12.5), color: C.muted, align: 'center' });
  }
  function illusShare(ctx, x, y, w, h, t) {
    rr(ctx, x, y, w, h, 10); ctx.fillStyle = C.bg; ctx.fill();
    const qr = D.share.qr; const size = Math.min(h - 70, 190);
    const qx = x + w / 2 - size / 2, qy = y + 14;
    rr(ctx, qx - 10, qy - 10, size + 20, size + 20, 8); ctx.fillStyle = '#fff'; ctx.fill();
    if (qr) {
      const n = qr.rows.length; const m = size / n; const rev = seg(t, 48.8, 49.8, E.lin);
      ctx.fillStyle = C.ink;
      qr.rows.forEach((row, r) => { if (r / n > rev) return; for (let c = 0; c < n; c++) if (row[c] === '1') ctx.fillRect(qx + c * m, qy + r * m, m + 0.3, m + 0.3); });
    }
    const url = D.share.url; const short = url.slice(0, 54) + '…';
    txt(ctx, short, x + w / 2, y + h - 34, { font: FM(400, 12.5), color: C.ink, align: 'center' });
    txt(ctx, `${D.share.length} caractères · QR version ${qr ? qr.version : '—'} · decodeScreen() valide à l’ouverture`, x + w / 2, y + h - 14, { font: FI(400, 12.5), color: C.muted, align: 'center' });
  }

  /* ───────────────────────── Logo 0:54–1:00 ───────────────────────── */
  const SQ = 66, GAP = 14, OFF = 30;
  function logoGeom(ctx) {
    const word = 'multi-screen'; const font = FI(600, 118);
    const ww = tw(ctx, word, font, -4); const mw = SQ * 2 + GAP; const gap = 46;
    const total = mw + gap + ww; const x0 = 960 - total / 2; const cy = 480;
    const y0 = cy - (SQ * 2 + GAP + OFF) / 2;
    const sq = [[x0, y0], [x0 + SQ + GAP, y0 + OFF], [x0, y0 + SQ + GAP], [x0 + SQ + GAP, y0 + SQ + GAP + OFF]].map(([x, y]) => [x, y, SQ, SQ]);
    return { sq, wx: x0 + mw + gap, cy, font, word };
  }
  function drawLogo(ctx, t) {
    if (t < 53.5) return;
    const G = logoGeom(ctx);
    const src = [[PL[0] + 56, PL[1] + 44, 420, 236], [PC[0][0], PC[0][1], PCW, PCH], [PC[1][0], PC[1][1], PCW, PCH], [PC[2][0], PC[2][1], PCW, PCH]];
    const cols = [C.accent, C.ink, C.ink, C.ink];
    G.sq.forEach((r, i) => {
      const k = seg(t, 53.6 + i * 0.07, 54.6 + i * 0.07, E.inOutCubic);
      const q = lr(src[i], r, k);
      const c = i === 0 ? C.accent : mix('#FFFFFF', C.ink, seg(t, 53.9 + i * 0.07, 54.5 + i * 0.07));
      alpha(ctx, seg(t, 53.55, 53.75), () => {
        rr(ctx, ...q, lerp(14, 10, k)); ctx.fillStyle = c; ctx.fill();
        if (k < 0.9 && i > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); }
      });
    });
    // le mot
    const wk = seg(t, 54.75, 55.5, E.outExpo);
    if (wk > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(G.wx - 10, G.cy - 100, (tw(ctx, G.word, G.font, -4) + 30) * wk, 200); ctx.clip();
      txt(ctx, G.word, G.wx - 30 * (1 - wk), G.cy + 4, { font: G.font, color: C.ink, ls: -4 });
      ctx.restore();
    }
    alpha(ctx, seg(t, 55.55, 56.1), () => txt(ctx, 'TypeScript · dockview · sans framework · MIT', 960, 660, { font: FM(500, 24), color: C.muted, align: 'center', ls: 0.5 }));
    alpha(ctx, seg(t, 56.3, 56.8), () => {
      pill(ctx, 960, 736, 'npm install multi-screen', { font: FM(500, 18), bg: '#FFFFFF', bd: C.line, color: C.ink, h: 44, r: 10, pad: 20 });
    });
    alpha(ctx, seg(t, 56.8, 57.3), () => txt(ctx, 'github.com/alexandre-plana/multi-screen', 960, 800, { font: FI(400, 17), color: C.faint, align: 'center' }));
  }

  /* ───────────────────────── Rendu ───────────────────────── */
  function render(ctx, t) {
    t = clamp(t, 0, DURATION);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    drawEditor(ctx, t);
    drawIntro(ctx, t);
    drawJSON(ctx, t);
    drawRoutes(ctx, t);
    drawBroadcast(ctx, t);
    drawDisplayPanel(ctx, t);
    drawBorne(ctx, t);
    drawEverywhere(ctx, t);
    drawLogo(ctx, t);
    drawCaptions(ctx, t);
    ctx.restore();
  }

  /* ───────────────────────── Repères sonores ───────────────────────── */
  const CUES = [];
  CUES.push({ t: 0.25, type: 'draw' }, { t: 1.25, type: 'stretch' }, { t: 1.75, type: 'split', i: 0 }, { t: 2.05, type: 'split', i: 1 }, { t: 2.85, type: 'title' }, { t: 4.35, type: 'land' });
  CUES.push({ t: 6.5, type: 'pick' }, { t: DROP1, type: 'drop', i: 0 }, { t: 9.0, type: 'pick' }, { t: DROP2, type: 'drop', i: 1 }, { t: SEL_I - 0.05, type: 'click' }, { t: VALUE_CLICK - 0.05, type: 'click' });
  for (let i = 0; i < 6; i++) CUES.push({ t: TYPE0 + i * 0.1, type: 'key' });
  CUES.push({ t: ENTER, type: 'enter' }, { t: SAVE - 0.05, type: 'save' });
  CUES.push({ t: 14.35, type: 'fold', d: 1.0 }, { t: INSERT + 0.1, type: 'insert' }, { t: PUT, type: 'version' }, { t: 20.2, type: 'select' }, { t: 21.55, type: 'fly', d: 0.8 });
  R_ADD.forEach((x, i) => CUES.push({ t: x, type: 'route', i }));
  CUES.push({ t: 25.45, type: 'navigate', i: 0 }, { t: 25.95, type: 'navigate', i: 1 }, { t: REMOVE, type: 'remove' }, { t: REMOVE + 0.3, type: 'follow' });
  HELLO.forEach((x, i) => CUES.push({ t: x + 0.55, type: 'hello', i }));
  CUES.push({ t: SEND - 0.05, type: 'click' }, { t: SEND + 0.05, type: 'send', d: SHOW1 - SEND }, { t: SHOW1, type: 'arrive', i: 0 }, { t: SHOW1 + 0.04, type: 'arrive', i: 1 });
  CUES.push({ t: ACK1 + 0.55, type: 'ack', i: 0 }, { t: ACK1 + 0.65, type: 'ack', i: 1 });
  CUES.push({ t: UPD, type: 'patch', d: PATCH1 - UPD }, { t: PATCH1, type: 'patched' }, { t: ACK2 + 0.6, type: 'ack', i: 0 }, { t: ACK2 + 0.7, type: 'ack', i: 1 });
  CUES.push({ t: 39.3, type: 'zoom', d: 0.9 }, { t: PIVOT, type: 'pivot', d: 0.85 }, { t: ROT, type: 'rotate', d: 0.8 });
  CUES.push({ t: TH1, type: 'theme', d: 0.7, i: 0 }, { t: TH2, type: 'theme', d: 0.7, i: 1 }, { t: HIDE, type: 'tabs' }, { t: LOCK, type: 'lock' }, { t: IDENT, type: 'identify' });
  CUES.push({ t: 48.1, type: 'cards' }, { t: 49.6, type: 'playlist' }, { t: 51.6, type: 'playlist' }, { t: 53.6, type: 'playlist' });
  CUES.push({ t: 53.6, type: 'gather', d: 1.0 }, { t: 54.75, type: 'logo' }, { t: 55.55, type: 'tagline' });
  CUES.sort((a, b) => a.t - b.t);

  // Images de la planche (storyboard) : [temps, légende]
  const BOARD = [[3.7, '0:00  Ouverture'], [9.2, '0:05  01 Composer'], [13.9, '0:13  01 Enregistré'], [19.8, '0:15  02 L’écran est une donnée'], [26.8, '0:22  03 Routes dynamiques'], [36.4, '0:30  04 Diffuser'], [44.9, '0:40  05 Régler l’affichage'], [52.6, '0:48  06 Partout'], [58.0, '0:54  Logo']];

  window.MS = { W, H, DURATION, render, CUES, BOARD };
})();
