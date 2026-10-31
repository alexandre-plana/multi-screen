/** Styles of multi-screen itself (dockview injects its own). */
export const MULTI_SCREEN_CSS = `
.ms-root{position:relative;overflow:hidden;width:100%;height:100%;contain:strict}
.ms-stage{position:absolute;top:0;left:0;transform-origin:0 0}
.ms-stage>.ms-dock{width:100%;height:100%}
.ms-panel{width:100%;height:100%;overflow:auto;box-sizing:border-box}
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
