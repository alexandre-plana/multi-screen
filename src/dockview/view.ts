import { createDockview, type AddPanelOptions, type DockviewApi, type DockviewOptions, type SerializedDockview } from 'dockview';
import { computeStage, mergeDisplay, mergeTheme } from '../core/display.js';
import { deepEqual } from '../core/patch.js';
import type { DisplaySpec, PanelSpec, ScreenDefinition, SerializedLayout, ThemeSpec } from '../core/types.js';
import type { PanelRegistry } from './registry.js';
import { injectStyles } from './styles.js';
import { resolveTheme } from './themes.js';

export interface ScreenViewOptions {
  registry: PanelRegistry;
  /** Screen shown at mount. */
  screen?: ScreenDefinition;
  /** Theme / display overrides, layered over the screen's own. */
  theme?: ThemeSpec;
  display?: DisplaySpec;
  /** Theme name used when a screen has no theme. Default `dark`. */
  defaultTheme?: string;
  /** Extra dockview options (anything but `createComponent`). */
  dockview?: Partial<DockviewOptions>;
  /** Called when the user rearranges the layout (drag'n'drop, resize, close). */
  onLayoutChange?: (layout: SerializedLayout, view: ScreenView) => void;
  /** Display side effects that failed (fullscreen without gesture, wake lock refused…). */
  onDisplayError?: (feature: 'fullscreen' | 'wakeLock', error: unknown) => void;
  /** Rendered when no screen is shown. */
  empty?: (element: HTMLElement) => void;
  /** Inject multi-screen's small stylesheet. Default true. */
  injectStyles?: boolean;
}

/**
 * A screen rendered with dockview inside a host element. Re-rendering with
 * an updated screen is incremental: params and titles are updated in place,
 * the layout is rebuilt only when its structure changed.
 */
export class ScreenView {
  readonly api: DockviewApi;
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  readonly #dock: HTMLElement;
  readonly #host: HTMLElement;
  readonly #options: ScreenViewOptions;
  #screen: ScreenDefinition | undefined;
  #structure: string | undefined;
  #themeOverride: ThemeSpec | undefined;
  #displayOverride: DisplaySpec | undefined;
  #display: DisplaySpec = {};
  /** Pending programmatic changes whose (asynchronous) layout events must not be reported. */
  #muted = 0;
  #resize: ResizeObserver | undefined;
  #wakeLock: { release(): Promise<void> } | undefined;
  #wakeWanted = false;
  #wakeRequest: Promise<void> | undefined;
  #disposed = false;
  #emptyEl: HTMLElement | undefined;
  #disposables: { dispose(): void }[] = [];
  #onVisibility = () => {
    if (document.visibilityState === 'visible' && this.#wakeWanted) void this.#acquireWakeLock();
  };

  constructor(host: HTMLElement, options: ScreenViewOptions) {
    if (options.injectStyles !== false) injectStyles(host.ownerDocument);
    this.#host = host;
    this.#options = options;
    this.#themeOverride = options.theme;
    this.#displayOverride = options.display;
    const doc = host.ownerDocument;
    this.root = doc.createElement('div');
    this.root.className = 'ms-root';
    this.stage = doc.createElement('div');
    this.stage.className = 'ms-stage';
    this.#dock = doc.createElement('div');
    this.#dock.className = 'ms-dock';
    this.stage.append(this.#dock);
    this.root.append(this.stage);
    host.append(this.root);

    const registry = options.registry;
    this.api = createDockview(this.#dock, {
      ...options.dockview,
      disableAutoResizing: true,
      theme: resolveTheme(undefined, options.defaultTheme),
      createComponent: ({ name }) => registry.createRenderer(name),
      createTabComponent: ({ name }) => registry.createTab(name),
    });
    this.#disposables.push(
      this.api.onDidLayoutChange(() => {
        if (this.#muted > 0 || !this.#screen) return;
        options.onLayoutChange?.(this.toJSON(), this);
      }),
    );
    if (typeof ResizeObserver !== 'undefined') {
      this.#resize = new ResizeObserver(() => this.layout());
      this.#resize.observe(this.root);
    }
    doc.addEventListener('visibilitychange', this.#onVisibility);
    this.render(options.screen);
  }

  /** Screen currently shown. */
  get screen(): ScreenDefinition | undefined {
    return this.#screen && structuredClone(this.#screen);
  }

  /** Effective display (screen display merged with overrides). */
  get display(): DisplaySpec {
    return { ...this.#display };
  }

  /** Shows a screen, or updates the one shown. `undefined` clears the view. */
  render(screen: ScreenDefinition | undefined): void {
    this.#mute();
    const structure = screen ? structureKey(screen) : undefined;
    try {
      if (!screen) {
        this.api.clear();
      } else if (this.#screen?.id === screen.id && structure === this.#structure) {
        this.#updateInPlace(screen);
      } else {
        this.#build(screen);
      }
    } catch (error) {
      // Leave a consistent, empty view: the next render rebuilds from scratch.
      this.api.clear();
      this.#screen = undefined;
      this.#structure = undefined;
      this.#toggleEmpty(true);
      throw error;
    }
    this.#screen = screen && structuredClone(screen);
    this.#structure = structure;
    this.#toggleEmpty(!screen);
    this.#applyTheme();
    this.#applyDisplay();
  }

  /**
   * dockview reports layout changes asynchronously (microtask): ignore those
   * caused by our own render/layout until the next macrotask.
   */
  #mute(): void {
    this.#muted++;
    setTimeout(() => {
      this.#muted--;
    }, 0);
  }

  setTheme(theme: ThemeSpec | undefined): void {
    this.#themeOverride = theme;
    this.#applyTheme();
  }

  setDisplay(display: DisplaySpec | undefined): void {
    this.#displayOverride = display;
    this.#applyDisplay();
  }

  /** Recomputes the stage geometry (called on resize). */
  layout(): void {
    this.#mute();
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    const geometry = computeStage({ width, height }, this.#display);
    this.stage.style.width = `${geometry.width}px`;
    this.stage.style.height = `${geometry.height}px`;
    this.stage.style.transform = geometry.transform;
    this.api.layout(geometry.width, geometry.height, true);
  }

  /** Current dockview layout (after user changes). */
  toJSON(): SerializedLayout {
    return this.api.toJSON() as unknown as SerializedLayout;
  }

  /** The shown screen with its current layout captured: ready to save or share. */
  toScreen(): ScreenDefinition | undefined {
    if (!this.#screen) return undefined;
    const { panels: _panels, ...rest } = this.#screen;
    return { ...structuredClone(rest), layout: this.toJSON() };
  }

  dispose(): void {
    this.#disposed = true;
    this.#resize?.disconnect();
    this.#host.ownerDocument.removeEventListener('visibilitychange', this.#onVisibility);
    void this.#releaseWakeLock();
    for (const d of this.#disposables) d.dispose();
    this.api.dispose();
    this.root.remove();
  }

  #build(screen: ScreenDefinition): void {
    this.api.clear();
    if (screen.layout) {
      this.api.fromJSON(screen.layout as unknown as SerializedDockview);
      return;
    }
    let previous: string | undefined;
    for (const panel of screen.panels ?? []) {
      this.api.addPanel(toAddPanelOptions(panel, previous, this.api));
      previous = panel.id;
    }
  }

  #updateInPlace(screen: ScreenDefinition): void {
    const before = panelContents(this.#screen!);
    for (const [id, next] of panelContents(screen)) {
      const panel = this.api.getPanel(id);
      const prev = before.get(id);
      if (!panel) continue;
      if (!deepEqual(prev?.params ?? {}, next.params ?? {})) {
        const params: Record<string, unknown> = { ...next.params };
        // Keys removed from the screen are cleared explicitly.
        for (const key of Object.keys(prev?.params ?? {})) if (!(key in params)) params[key] = undefined;
        panel.api.updateParameters(params);
      }
      if ((prev?.title ?? id) !== (next.title ?? id)) panel.api.setTitle(next.title ?? id);
    }
  }

  #applyTheme(): void {
    const spec = mergeTheme(this.#screen?.theme, this.#themeOverride);
    this.api.updateOptions({ theme: resolveTheme(spec, this.#options.defaultTheme) });
    const previous = (this.root.dataset.msVars ?? '').split(' ').filter(Boolean);
    for (const name of previous) {
      this.root.style.removeProperty(name);
      this.#dock.style.removeProperty(name);
    }
    const vars = spec?.variables ?? {};
    for (const [name, value] of Object.entries(vars)) {
      // Set on the root (for panel content) and on the dockview element (to win over the theme class).
      this.root.style.setProperty(name, value);
      this.#dock.style.setProperty(name, value);
    }
    this.root.dataset.msVars = Object.keys(vars).join(' ');
    const previousClass = this.root.dataset.msClass;
    if (previousClass) this.root.classList.remove(...previousClass.split(' ').filter(Boolean));
    if (spec?.className) this.root.classList.add(...spec.className.split(' ').filter(Boolean));
    this.root.dataset.msClass = spec?.className ?? '';
    const scheme = spec?.colorScheme ?? (resolveTheme(spec, this.#options.defaultTheme) as { colorScheme?: 'light' | 'dark' }).colorScheme;
    if (scheme) this.root.style.colorScheme = scheme;
    this.root.dataset.theme = spec?.base ?? this.#options.defaultTheme ?? 'dark';
  }

  #applyDisplay(): void {
    const previous = this.#display;
    const display = mergeDisplay(this.#screen?.display, this.#displayOverride);
    this.#display = display;
    this.root.classList.toggle('ms-hide-tabs', display.hideTabs === true);
    this.root.classList.toggle('ms-no-cursor', display.cursor === 'none');
    this.root.style.background = display.background ?? '';
    if (previous.locked !== display.locked) {
      this.api.updateOptions({ locked: display.locked === true, disableDnd: display.locked === true });
    }
    this.layout();
    if (previous.fullscreen !== display.fullscreen) void this.#applyFullscreen(display.fullscreen === true);
    if (previous.wakeLock !== display.wakeLock) {
      this.#wakeWanted = display.wakeLock === true;
      if (this.#wakeWanted) void this.#acquireWakeLock();
      else void this.#releaseWakeLock();
    }
  }

  async #applyFullscreen(on: boolean): Promise<void> {
    const doc = this.#host.ownerDocument;
    try {
      if (on && !doc.fullscreenElement) {
        if (typeof this.#host.requestFullscreen !== 'function') throw new Error('Fullscreen API unavailable');
        await this.#host.requestFullscreen();
      }
      else if (!on && doc.fullscreenElement === this.#host) await doc.exitFullscreen();
    } catch (error) {
      this.#options.onDisplayError?.('fullscreen', error);
    }
  }

  #acquireWakeLock(): Promise<void> {
    const nav = globalThis.navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
    if (!nav?.wakeLock || this.#wakeLock || this.#wakeRequest) return this.#wakeRequest ?? Promise.resolve();
    this.#wakeRequest = (async () => {
      try {
        const lock = await nav.wakeLock!.request('screen');
        // Released or disposed while the request was pending: give it back.
        if (!this.#wakeWanted || this.#disposed) {
          await lock.release().catch(() => undefined);
          return;
        }
        this.#wakeLock = lock;
        (lock as unknown as EventTarget).addEventListener?.('release', () => {
          if (this.#wakeLock === lock) this.#wakeLock = undefined;
        });
      } catch (error) {
        this.#options.onDisplayError?.('wakeLock', error);
      } finally {
        this.#wakeRequest = undefined;
      }
    })();
    return this.#wakeRequest;
  }

  async #releaseWakeLock(): Promise<void> {
    this.#wakeWanted = false;
    const lock = this.#wakeLock;
    this.#wakeLock = undefined;
    await lock?.release().catch(() => undefined);
  }

  #toggleEmpty(empty: boolean): void {
    if (empty && !this.#emptyEl) {
      this.#emptyEl = this.root.ownerDocument.createElement('div');
      this.#emptyEl.className = 'ms-empty';
      if (this.#options.empty) this.#options.empty(this.#emptyEl);
      else this.#emptyEl.textContent = 'No screen';
      this.root.append(this.#emptyEl);
    } else if (!empty && this.#emptyEl) {
      this.#emptyEl.remove();
      this.#emptyEl = undefined;
    }
  }
}

export function mountScreen(host: HTMLElement, options: ScreenViewOptions): ScreenView {
  return new ScreenView(host, options);
}

function toAddPanelOptions(panel: PanelSpec, previous: string | undefined, api: DockviewApi): AddPanelOptions {
  const reference = panel.position?.referencePanel ?? previous;
  const direction = panel.position?.direction ?? 'right';
  const options: Record<string, unknown> = {
    id: panel.id,
    component: panel.component,
    title: panel.title ?? panel.id,
    params: panel.params ?? {},
  };
  if (panel.tabComponent) options.tabComponent = panel.tabComponent;
  if (panel.initialWidth !== undefined) options.initialWidth = panel.initialWidth;
  if (panel.initialHeight !== undefined) options.initialHeight = panel.initialHeight;
  if (reference && api.getPanel(reference)) options.position = { referencePanel: reference, direction };
  else if (panel.position?.direction && panel.position.direction !== 'within' && api.panels.length > 0) options.position = { direction: panel.position.direction };
  return options as unknown as AddPanelOptions;
}

function panelContents(screen: ScreenDefinition): Map<string, { params?: Record<string, unknown>; title?: string }> {
  const map = new Map<string, { params?: Record<string, unknown>; title?: string }>();
  if (screen.layout) {
    for (const [id, panel] of Object.entries(screen.layout.panels)) map.set(id, { params: panel.params ?? {}, ...(panel.title ? { title: panel.title } : {}) });
  } else {
    for (const panel of screen.panels ?? []) map.set(panel.id, { params: panel.params ?? {}, ...(panel.title ? { title: panel.title } : {}) });
  }
  return map;
}

/** Everything that requires rebuilding the layout when it changes. */
export function structureKey(screen: ScreenDefinition): string {
  if (screen.layout) {
    const panels = Object.fromEntries(
      Object.entries(screen.layout.panels).map(([id, { params: _p, title: _t, ...rest }]) => [id, rest]),
    );
    return JSON.stringify({ ...screen.layout, panels });
  }
  return JSON.stringify((screen.panels ?? []).map(({ params: _p, title: _t, ...rest }) => rest));
}
