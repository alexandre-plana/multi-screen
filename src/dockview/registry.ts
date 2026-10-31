import type { DockviewApi, DockviewPanelApi, GroupPanelPartInitParameters, IContentRenderer, ITabRenderer, TabPartInitParameters } from 'dockview';

/** What a panel factory receives. */
export interface PanelContext<P = Record<string, unknown>> {
  /** Element to render into (already attached to the layout). */
  element: HTMLElement;
  id: string;
  params: P;
  /** Panel API (title, visibility, size…). */
  api: DockviewPanelApi;
  /** Whole layout API. */
  containerApi: DockviewApi;
}

/** Optional lifecycle returned by a factory. */
export interface PanelInstance<P = Record<string, unknown>> {
  /** New params (a screen update changed them). Omitted: the panel is re-created. */
  update?(params: P): void;
  onShow?(): void;
  onHide?(): void;
  layout?(width: number, height: number): void;
  focus?(): void;
  dispose?(): void;
}

/**
 * A panel component in its simplest, framework-free form: a function that
 * renders into `ctx.element`. React, Vue, Svelte, Lit or Web Components are
 * all wrapped into this shape (see `multi-screen/react` for React).
 */
export type PanelFactory<P = Record<string, unknown>> = (ctx: PanelContext<P>) => PanelInstance<P> | void;

export interface PanelComponentOptions {
  /** Human label shown in editors / pickers. */
  label?: string;
  /** Default params merged under the screen's params. */
  defaults?: Record<string, unknown>;
  /** JSON schema (or any description) of the params, for editors. Not interpreted. */
  schema?: unknown;
}

export interface PanelComponent extends PanelComponentOptions {
  name: string;
  factory: PanelFactory<any>;
}

/** Registry of the components that screens may reference by name. */
export class PanelRegistry {
  readonly #components = new Map<string, PanelComponent>();
  readonly #tabs = new Map<string, () => ITabRenderer>();
  #fallback: PanelFactory<any> = defaultFallback;

  register<P = Record<string, unknown>>(name: string, factory: PanelFactory<P>, options: PanelComponentOptions = {}): this {
    this.#components.set(name, { ...options, name, factory });
    return this;
  }

  /** Registers several components: `registry.registerAll({ clock, weather })`. */
  registerAll(components: Record<string, PanelFactory<any>>): this {
    for (const [name, factory] of Object.entries(components)) this.register(name, factory);
    return this;
  }

  unregister(name: string): boolean {
    return this.#components.delete(name);
  }

  /** Custom tab renderer (raw dockview API). */
  registerTab(name: string, create: () => ITabRenderer): this {
    this.#tabs.set(name, create);
    return this;
  }

  /** Rendered when a screen references an unknown component. */
  setFallback(factory: PanelFactory<any>): this {
    this.#fallback = factory;
    return this;
  }

  get(name: string): PanelComponent | undefined {
    return this.#components.get(name);
  }

  has(name: string): boolean {
    return this.#components.has(name);
  }

  list(): PanelComponent[] {
    return [...this.#components.values()];
  }

  /** @internal dockview `createComponent` implementation. */
  createRenderer(name: string): IContentRenderer {
    const component = this.#components.get(name);
    return new FactoryRenderer(component?.factory ?? this.#fallback, component?.defaults, name);
  }

  /** @internal dockview `createTabComponent` implementation. */
  createTab(name: string): ITabRenderer | undefined {
    return this.#tabs.get(name)?.();
  }
}

export function createPanelRegistry(components?: Record<string, PanelFactory<any>>): PanelRegistry {
  const registry = new PanelRegistry();
  if (components) registry.registerAll(components);
  return registry;
}

class FactoryRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  #instance: PanelInstance | void = undefined;
  #context: PanelContext | undefined;

  constructor(
    private readonly factory: PanelFactory<any>,
    private readonly defaults: Record<string, unknown> | undefined,
    private readonly name: string,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'ms-panel';
    this.element.dataset.component = name;
  }

  init(parameters: GroupPanelPartInitParameters): void {
    this.#context = {
      element: this.element,
      id: parameters.api.id,
      params: { ...this.defaults, ...parameters.params },
      api: parameters.api,
      containerApi: parameters.containerApi,
    };
    this.#instance = this.factory(this.#context);
  }

  update(event: { params: Record<string, unknown> }): void {
    if (!this.#context) return;
    // dockview hands the full parameter set after `updateParameters`.
    const params: Record<string, unknown> = { ...this.defaults };
    for (const [key, value] of Object.entries(event.params)) {
      if (value === undefined) delete params[key];
      else params[key] = value;
    }
    this.#context.params = params;
    if (this.#instance && this.#instance.update) {
      this.#instance.update(params);
    } else {
      this.#instance?.dispose?.();
      this.element.replaceChildren();
      this.#instance = this.factory(this.#context);
    }
  }

  onShow(): void {
    this.#instance?.onShow?.();
  }

  onHide(): void {
    this.#instance?.onHide?.();
  }

  layout(width: number, height: number): void {
    this.#instance?.layout?.(width, height);
  }

  focus(): void {
    this.#instance?.focus?.();
  }

  dispose(): void {
    this.#instance?.dispose?.();
    this.#instance = undefined;
  }
}

const defaultFallback: PanelFactory = ({ element }) => {
  const name = element.dataset.component ?? '?';
  const box = document.createElement('div');
  box.className = 'ms-missing';
  box.textContent = `Unknown panel component "${name}"`;
  element.append(box);
};

export type { TabPartInitParameters };
