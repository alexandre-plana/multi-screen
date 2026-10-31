/** Styles of multi-screen itself (dockview injects its own). */
export const MULTI_SCREEN_CSS = `
.ms-root{position:relative;overflow:hidden;width:100%;height:100%;contain:strict}
.ms-stage{position:absolute;top:0;left:0;transform-origin:0 0}
.ms-stage>.ms-dock{width:100%;height:100%}
.ms-panel{width:100%;height:100%;overflow:auto;box-sizing:border-box;color:var(--ms-panel-color,var(--dv-color,var(--dv-activegroup-visiblepanel-tab-color,inherit)))}
.ms-root.ms-hide-tabs .dv-tabs-and-actions-container{display:none!important}
.ms-root.ms-no-cursor,.ms-root.ms-no-cursor *{cursor:none!important}
.ms-missing{display:flex;align-items:center;justify-content:center;height:100%;padding:1em;font:14px system-ui,sans-serif;opacity:.7;text-align:center}
.ms-empty{display:flex;align-items:center;justify-content:center;height:100%;font:16px system-ui,sans-serif;opacity:.6}
.ms-identify{position:absolute;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;pointer-events:none;
background:rgba(0,0,0,.55);color:#fff;font:600 clamp(24px,8vmin,120px)/1.1 system-ui,sans-serif;text-align:center;
animation:ms-identify-in .2s ease-out}
@keyframes ms-identify-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.ms-identify{animation:none}}
`;

let injected = false;

/** Injects the stylesheet once per document. Called automatically by the views. */
export function injectStyles(doc: Document = document): void {
  if (injected && doc === document) return;
  if (doc.getElementById('multi-screen-styles')) return;
  const style = doc.createElement('style');
  style.id = 'multi-screen-styles';
  style.textContent = MULTI_SCREEN_CSS;
  doc.head.append(style);
  if (doc === document) injected = true;
}

/**
 * Styles of the screen editor. Every colour is a CSS variable (`--mse-*`)
 * so the editor can be themed from the host page.
 */
export const EDITOR_CSS = `
.mse{--mse-bg:#f6f7f9;--mse-fg:#1b1f24;--mse-muted:#5d6673;--mse-card:#fff;--mse-line:#d9dde3;--mse-accent:#2f6fde;--mse-danger:#c0392b;
display:grid;grid-template-columns:240px minmax(0,1fr) 280px;height:100%;min-height:0;background:var(--mse-bg);color:var(--mse-fg);font:14px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}
@media (prefers-color-scheme:dark){.mse{--mse-bg:#111418;--mse-fg:#e8eaee;--mse-muted:#9aa3ae;--mse-card:#1a1e24;--mse-line:#2c323b;--mse-accent:#6a9cff;--mse-danger:#ff7a6b}}
.mse *{box-sizing:border-box}
.mse-side,.mse-inspector{overflow:auto;padding:12px;border-right:1px solid var(--mse-line);min-height:0}
.mse-inspector{border-right:0;border-left:1px solid var(--mse-line)}
.mse-main{display:grid;grid-template-rows:auto minmax(0,1fr);min-width:0;min-height:0}
.mse-h{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mse-muted);margin:12px 0 6px}
.mse-h:first-child{margin-top:0}
.mse-hint{color:var(--mse-muted);font-size:12px;margin:4px 0 8px}
.mse-list,.mse-palette{list-style:none;margin:6px 0 12px;padding:0;display:grid;gap:4px}
.mse-btn,.mse-item,.mse-chip{font:inherit;color:inherit;background:var(--mse-card);border:1px solid var(--mse-line);border-radius:6px;padding:6px 10px;cursor:pointer}
.mse-btn:disabled{opacity:.5;cursor:default}
.mse-primary{background:var(--mse-accent);border-color:var(--mse-accent);color:#fff}
.mse-danger{color:var(--mse-danger)}
.mse-item{width:100%;text-align:left}
.mse-item[aria-current=true]{border-color:var(--mse-accent);box-shadow:0 0 0 1px var(--mse-accent)}
.mse-chip{width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:0;cursor:grab;text-align:left}
.mse-chip:active{cursor:grabbing}
.mse-chip-name{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--mse-muted)}
.mse-toolbar{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--mse-line);flex-wrap:wrap}
.mse-title{font:600 15px system-ui,sans-serif;color:inherit;background:transparent;border:1px solid transparent;border-radius:6px;padding:5px 8px;min-width:0;flex:0 1 280px}
.mse-title:hover,.mse-title:focus{border-color:var(--mse-line);background:var(--mse-card)}
.mse-status{color:var(--mse-muted);font-size:12px}
.mse-status[data-state=dirty]{color:var(--mse-accent)}
.mse-spacer{flex:1}
.mse-canvas{position:relative;margin:12px;border:1px dashed var(--mse-line);border-radius:8px;overflow:hidden;min-height:240px}
.mse-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mse-muted);pointer-events:none}
.mse-empty[hidden]{display:none}
.mse-section{display:grid;gap:6px;margin-bottom:16px}
.mse-field{display:grid;gap:2px}
.mse-field label{font-size:12px;color:var(--mse-muted)}
.mse-field input:not([type=checkbox]),.mse-field select,.mse-field textarea,.mse-json{font:inherit;color:inherit;background:var(--mse-card);border:1px solid var(--mse-line);border-radius:6px;padding:5px 8px;width:100%;min-width:0}
.mse-field input[type=color]{padding:2px;height:30px}
.mse-field input[readonly]{opacity:.7}
.mse-json{font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;min-height:120px;margin-top:6px}
.mse-check{display:flex;gap:6px;align-items:center;font-size:13px}
.mse-row{display:flex;gap:8px;align-items:center;margin-top:6px}
.mse-error{color:var(--mse-danger);font-size:12px}
.mse-details summary{cursor:pointer;font-size:12px;color:var(--mse-muted)}
.mse :focus-visible{outline:2px solid var(--mse-accent);outline-offset:2px}
@media (max-width:900px){.mse{grid-template-columns:1fr;grid-template-rows:auto minmax(420px,1fr) auto;height:auto}.mse-side,.mse-inspector{border:0;border-bottom:1px solid var(--mse-line)}}
`;

/** Injects the editor stylesheet once per document. */
export function injectEditorStyles(doc: Document = document): void {
  injectStyles(doc);
  if (doc.getElementById('multi-screen-editor-styles')) return;
  const style = doc.createElement('style');
  style.id = 'multi-screen-editor-styles';
  style.textContent = EDITOR_CSS;
  doc.head.append(style);
}
