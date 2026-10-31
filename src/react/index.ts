import { createElement, useEffect, useRef, useSyncExternalStore, type ComponentType, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import type { DockviewApi, DockviewPanelApi } from 'dockview';
import type { DeviceRecord, ScreenHub } from '../core/hub.js';
import type { RouteMatch, ScreenRouter } from '../core/router.js';
import type { ScreenStore } from '../core/store.js';
import type { ScreenDefinition } from '../core/types.js';
import type { ScreenDevice } from '../core/device.js';
import type { PanelFactory } from '../dockview/registry.js';
import { createScreenOutlet, type ScreenOutlet, type ScreenOutletOptions } from '../dockview/outlet.js';

export interface PanelProps<P = Record<string, unknown>> {
  id: string;
  params: P;
  api: DockviewPanelApi;
  containerApi: DockviewApi;
}

/**
 * Wraps a React component as a panel factory. Each panel gets its own React
 * root; params updates re-render it.
 */
export function reactPanel<P = Record<string, unknown>>(Component: ComponentType<PanelProps<P>>): PanelFactory<P> {
  return (ctx) => {
    const root = createRoot(ctx.element);
    const render = (params: P) => root.render(createElement(Component, { id: ctx.id, params, api: ctx.api, containerApi: ctx.containerApi }));
    render(ctx.params);
    return {
      update: render,
      dispose: () => {
        // Unmounting synchronously during a React render is not allowed.
        queueMicrotask(() => root.unmount());
      },
    };
  };
}

export interface ScreenOutletProps extends ScreenOutletOptions {
  className?: string;
  style?: CSSProperties;
  /** Receives the imperative outlet (view, dockview api…). */
  onReady?: (outlet: ScreenOutlet) => void;
}

/** Renders the screen pointed to by the router. Options are read at mount. */
export function ScreenOutletView({ className, style, onReady, ...options }: ScreenOutletProps) {
  const ref = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useEffect(() => {
    const outlet = createScreenOutlet(ref.current!, optionsRef.current);
    onReady?.(outlet);
    return () => outlet.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.router, options.store, options.device, options.registry]);
  return createElement('div', { ref, className, style: { width: '100%', height: '100%', ...style } });
}

function useSubscription<T>(subscribe: (cb: () => void) => () => void, read: () => T): T {
  const cache = useRef<{ value: T; key: string } | undefined>(undefined);
  return useSyncExternalStore(subscribe, () => {
    const value = read();
    const key = JSON.stringify(value);
    if (!cache.current || cache.current.key !== key) cache.current = { value, key };
    return cache.current.value;
  });
}

/** Screens of a store, live. */
export function useScreens(store: ScreenStore): ScreenDefinition[] {
  return useSubscription(
    (cb) => store.subscribe(cb),
    () => store.list(),
  );
}

/** One screen of a store, live. */
export function useScreen(store: ScreenStore, id: string | undefined): ScreenDefinition | undefined {
  return useSubscription(
    (cb) => store.subscribe(cb),
    () => (id ? store.get(id) : undefined),
  );
}

/** Devices known by a hub, live. */
export function useDevices(hub: ScreenHub): DeviceRecord[] {
  return useSubscription(
    (cb) => hub.subscribe((event) => event.type === 'devices' && cb()),
    () => hub.devices(),
  );
}

/** Current route match, live. */
export function useRouteMatch(router: ScreenRouter): RouteMatch | undefined {
  return useSubscription(
    (cb) => router.subscribe(cb),
    () => router.current,
  );
}

/** Device state, live. */
export function useDeviceState(device: ScreenDevice) {
  return useSubscription(
    (cb) => device.subscribe((event) => event.type === 'state' && cb()),
    () => device.state,
  );
}
