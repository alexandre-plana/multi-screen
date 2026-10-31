/**
 * Data model shared by every layer of multi-screen.
 *
 * Everything in this file is plain, JSON-serialisable data: a screen can be
 * stored, diffed, sent over a socket or encoded in a URL without losing
 * information. The core never imports dockview at runtime; the dockview
 * layout is described structurally so that the core stays usable on a server
 * or in a worker.
 */

/** Any JSON value. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Free-form JSON object (panel params, metadata…). */
export type JsonObject = { [key: string]: Json | undefined };

/** Where a panel is placed relative to another panel (dockview semantics). */
export type PanelDirection = 'left' | 'right' | 'above' | 'below' | 'within';

/**
 * A declarative panel. A screen made of `panels` is built in order: each panel
 * is added next to `position.referencePanel` (or to the root when omitted).
 */
export interface PanelSpec {
  /** Unique id inside the screen. */
  id: string;
  /** Name of a component registered in the panel registry. */
  component: string;
  /** Tab title. Defaults to the id. */
  title?: string;
  /** Parameters handed to the component. Must be JSON. */
  params?: JsonObject;
  /** Placement. Omitted: the panel is added to the right of the previous one. */
  position?: {
    referencePanel?: string;
    direction?: PanelDirection;
  };
  /** Initial size hints, in pixels. */
  initialWidth?: number;
  initialHeight?: number;
  /** Optional tab renderer registered in the registry. */
  tabComponent?: string;
}

/**
 * A full dockview layout as produced by `DockviewApi.toJSON()`.
 * Typed structurally so the core does not depend on dockview.
 */
export interface SerializedLayout {
  grid: { root: unknown; width: number; height: number; orientation: string };
  panels: Record<
    string,
    {
      id: string;
      contentComponent?: string;
      tabComponent?: string;
      title?: string;
      params?: Record<string, unknown>;
      [key: string]: unknown;
    }
  >;
  activeGroup?: string;
  floatingGroups?: unknown[];
  popoutGroups?: unknown[];
  [key: string]: unknown;
}

/**
 * Visual theme of a screen.
 *
 * `base` names a registered theme (all dockview themes are registered by the
 * dockview layer: `dark`, `light`, `abyss`, `dracula`, `nord`…). `variables`
 * are CSS custom properties applied on the screen host, so any `--dv-*`
 * variable of dockview, or your own variables, can be overridden.
 */
export interface ThemeSpec {
  base?: string;
  colorScheme?: 'light' | 'dark';
  /** Gap between groups, in pixels. */
  gap?: number;
  /** CSS custom properties, e.g. `{ '--dv-background-color': '#000' }`. */
  variables?: Record<string, string>;
  /** Extra class names applied on the host. */
  className?: string;
}

/** Rotation of the whole screen, in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * How a device renders a screen. Every field is optional; a device merges the
 * screen's display with its own overrides (see {@link mergeDisplay}).
 */
export interface DisplaySpec {
  /** Ask the browser for fullscreen (needs a user gesture on most browsers). */
  fullscreen?: boolean;
  /** Keep the screen awake (Screen Wake Lock API) while the screen is shown. */
  wakeLock?: boolean;
  /**
   * Virtual resolution of the screen. When set, the layout is computed for
   * this size and scaled to fit the device (`fit`).
   */
  resolution?: { width: number; height: number };
  /** How a virtual resolution is fitted: `contain` keeps ratio, `fill` stretches, `none` uses `scale`. */
  fit?: 'contain' | 'fill' | 'none';
  /** Manual zoom factor (1 = 100 %). Applied after `fit`. */
  scale?: number;
  /** Rotates the whole screen; useful for portrait totems. */
  rotation?: Rotation;
  /** `none` hides the pointer (kiosks, signage). */
  cursor?: 'auto' | 'none';
  /** Disable drag'n'drop and resizing: the layout is frozen. */
  locked?: boolean;
  /** Hide the tab bars for a clean, chrome-less display. */
  hideTabs?: boolean;
  /** Background behind the layout (CSS colour). */
  background?: string;
}

/** A screen: a named, routable composition of dockview panels. */
export interface ScreenDefinition {
  id: string;
  title?: string;
  /**
   * Route pattern of the screen (path-to-regexp syntax, e.g. `/hall/:zone`).
   * Omitted: the screen is reachable through the router's default screen
   * route (`/screens/:screenId`).
   */
  route?: string;
  /** Declarative panels. Ignored when `layout` is set. */
  panels?: PanelSpec[];
  /** Exact dockview layout (takes precedence over `panels`). */
  layout?: SerializedLayout;
  theme?: ThemeSpec;
  display?: DisplaySpec;
  /** Incremented by the store on every change. */
  version?: number;
  /** ISO date of the last change. */
  updatedAt?: string;
  /** Application data; never interpreted by the library. */
  meta?: JsonObject;
}

/** Description of a device, announced when it joins. */
export interface DeviceInfo {
  id: string;
  name?: string;
  /** Free tags used to target groups of devices (`tag:lobby`). */
  tags?: string[];
  /** Device role, e.g. `display`, `controller`, `tablet`. */
  kind?: string;
  /** Viewport in CSS pixels at the time of the announce. */
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  userAgent?: string;
  /** Capabilities advertised by the device (`fullscreen`, `wakeLock`…). */
  capabilities?: string[];
  meta?: JsonObject;
}

/** What a device currently shows. */
export interface DeviceState {
  /** Screen currently routed, if any. */
  screenId?: string;
  /** Current path in the device router. */
  path?: string;
  /** Ids, versions and content hashes of the screens stored on the device. */
  screens: { id: string; version: number; hash?: string }[];
  /** Device-level theme override (wins over the screen theme). */
  theme?: ThemeSpec;
  /** Device-level display override (merged over the screen display). */
  display?: DisplaySpec;
}
