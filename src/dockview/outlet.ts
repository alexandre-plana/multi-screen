import type { ScreenDevice } from '../core/device.js';
import type { Unsubscribe } from '../core/emitter.js';
import type { RouteMatch, ScreenRouter } from '../core/router.js';
import type { ScreenStore } from '../core/store.js';
import type { ScreenDefinition } from '../core/types.js';
import { ScreenView, type ScreenViewOptions } from './view.js';

export interface ScreenOutletOptions extends Omit<ScreenViewOptions, 'screen'> {
  router: ScreenRouter;
  /** Where screens are read. Defaults to `device.store`. */
  store?: ScreenStore;
  /** When given, the device's theme/display overrides and identify requests are applied. */
  device?: ScreenDevice;
  /** Rendered when the URL matches no stored screen. */
  notFound?: (element: HTMLElement, match: RouteMatch | undefined) => void;
  /** A screen could not be rendered (invalid layout, failing panel…). Default: console.error. */
  onError?: (error: unknown, screen: ScreenDefinition | undefined) => void;
  /** Called after each render. */
  onRender?: (screen: ScreenDefinition | undefined, match: RouteMatch | undefined) => void;
}

export interface ScreenOutlet {
  readonly view: ScreenView;
  /** Re-reads router and store and renders. */
  refresh(): void;
  dispose(): void;
}

/**
 * Glues a router, a store and a view: whatever screen the URL points to is
 * rendered, and re-rendered live when the store changes it.
 */
export function createScreenOutlet(element: HTMLElement, options: ScreenOutletOptions): ScreenOutlet {
  const store = options.store ?? options.device?.store;
  if (!store) throw new Error('createScreenOutlet needs a store or a device');
  const { router, device } = options;
  let notFoundEl: HTMLElement | undefined;
  const view = new ScreenView(element, {
    ...options,
    ...(device ? { theme: device.themeOverride, display: device.displayOverride } : {}),
  });

  const refresh = () => {
    const match = router.current;
    const screen = match?.screenId ? store.get(match.screenId) : undefined;
    if (device) {
      view.setTheme(device.themeOverride);
      view.setDisplay(device.displayOverride);
    }
    try {
      view.render(screen);
    } catch (error) {
      (options.onError ?? ((e) => console.error('multi-screen: cannot render screen', e)))(error, screen);
    }
    notFoundEl?.remove();
    notFoundEl = undefined;
    if (!screen && match && options.notFound) {
      notFoundEl = element.ownerDocument.createElement('div');
      notFoundEl.className = 'ms-empty';
      notFoundEl.style.cssText = 'position:absolute;inset:0';
      options.notFound(notFoundEl, match);
      view.root.append(notFoundEl);
    }
    options.onRender?.(screen, match);
  };

  const cleanups: Unsubscribe[] = [
    router.subscribe((event) => {
      if (event.type === 'navigate') refresh();
    }),
    store.subscribe((event) => {
      const current = router.current?.screenId;
      if (event.type === 'reset' || (current && event.screen.id === current)) refresh();
    }),
  ];
  if (device) {
    cleanups.push(
      device.subscribe((event) => {
        if (event.type === 'state') {
          view.setTheme(device.themeOverride);
          view.setDisplay(device.displayOverride);
        } else if (event.type === 'identify') {
          showIdentify(view.root, device.info.name ?? device.info.id, event.durationMs);
        }
      }),
    );
  }
  refresh();

  return {
    view,
    refresh,
    dispose() {
      for (const cleanup of cleanups) cleanup();
      view.dispose();
    },
  };
}

/** Big overlay with a label, used to spot a physical screen. */
export function showIdentify(container: HTMLElement, label: string, durationMs = 3000): () => void {
  const overlay = container.ownerDocument.createElement('div');
  overlay.className = 'ms-identify';
  overlay.setAttribute('role', 'status');
  overlay.textContent = label;
  container.append(overlay);
  const timer = setTimeout(() => overlay.remove(), durationMs);
  return () => {
    clearTimeout(timer);
    overlay.remove();
  };
}
