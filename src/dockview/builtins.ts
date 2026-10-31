import type { PanelFactory } from './registry.js';
import { PanelRegistry } from './registry.js';

/**
 * Ready-made, data-only panels: a screen built only from them can be sent
 * to any device without shipping code. Content is always set as text or
 * attributes, never as HTML.
 */

/** `{ text, align?, size?, color?, background? }` */
export const textPanel: PanelFactory<{ text?: string; align?: string; size?: string; color?: string; background?: string }> = ({ element, params }) => {
  const box = document.createElement('div');
  box.style.cssText = 'display:flex;height:100%;padding:1em;box-sizing:border-box;white-space:pre-wrap;font-family:system-ui,sans-serif';
  element.append(box);
  const apply = (p: typeof params) => {
    box.textContent = p.text ?? '';
    box.style.alignItems = 'center';
    box.style.justifyContent = p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center';
    box.style.textAlign = p.align ?? 'center';
    box.style.fontSize = p.size ?? '2em';
    box.style.color = p.color ?? '';
    box.style.background = p.background ?? '';
  };
  apply(params);
  return { update: apply };
};

/** `{ src, alt?, fit? }` */
export const imagePanel: PanelFactory<{ src?: string; alt?: string; fit?: string }> = ({ element, params }) => {
  const img = document.createElement('img');
  img.style.cssText = 'display:block;width:100%;height:100%';
  element.append(img);
  const apply = (p: typeof params) => {
    if (p.src && /^(https?:|data:image\/|blob:|\/|\.)/.test(p.src)) img.src = p.src;
    else img.removeAttribute('src');
    img.alt = p.alt ?? '';
    img.style.objectFit = p.fit ?? 'contain';
  };
  apply(params);
  return { update: apply };
};

/** `{ src, sandbox?, allow? }` – sandboxed by default (`allow-scripts allow-same-origin`). */
export const iframePanel: PanelFactory<{ src?: string; sandbox?: string; allow?: string; title?: string }> = ({ element, params }) => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
  element.append(frame);
  const apply = (p: typeof params) => {
    frame.setAttribute('sandbox', p.sandbox ?? 'allow-scripts allow-same-origin');
    if (p.allow) frame.setAttribute('allow', p.allow);
    frame.title = p.title ?? 'Embedded content';
    if (p.src && /^https?:/.test(p.src) && frame.src !== p.src) frame.src = p.src;
  };
  apply(params);
  return { update: apply };
};

/** `{ timeZone?, locale?, seconds?, size? }` */
export const clockPanel: PanelFactory<{ timeZone?: string; locale?: string; seconds?: boolean; size?: string }> = ({ element, params }) => {
  const box = document.createElement('time');
  box.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;font:600 3em system-ui,sans-serif;font-variant-numeric:tabular-nums';
  element.append(box);
  let current = params;
  const tick = () => {
    const now = new Date();
    box.dateTime = now.toISOString();
    box.style.fontSize = current.size ?? '3em';
    try {
      box.textContent = now.toLocaleTimeString(current.locale, {
        hour: '2-digit', minute: '2-digit', ...(current.seconds === false ? {} : { second: '2-digit' }),
        ...(current.timeZone ? { timeZone: current.timeZone } : {}),
      });
    } catch {
      box.textContent = now.toLocaleTimeString();
    }
  };
  tick();
  const timer = setInterval(tick, 1000);
  return {
    update(p) {
      current = p;
      tick();
    },
    dispose: () => clearInterval(timer),
  };
};

/** `{ color }` – a solid colour, handy for testing walls and calibration. */
export const colorPanel: PanelFactory<{ color?: string }> = ({ element, params }) => {
  const apply = (p: typeof params) => {
    element.style.background = p.color ?? 'transparent';
  };
  apply(params);
  return { update: apply };
};

export const builtinPanels = {
  'ms:text': textPanel,
  'ms:image': imagePanel,
  'ms:iframe': iframePanel,
  'ms:clock': clockPanel,
  'ms:color': colorPanel,
} as const;

/** Adds the built-in panels (`ms:text`, `ms:image`, `ms:iframe`, `ms:clock`, `ms:color`). */
export function registerBuiltinPanels(registry: PanelRegistry): PanelRegistry {
  return registry.registerAll(builtinPanels as Record<string, PanelFactory<any>>);
}
