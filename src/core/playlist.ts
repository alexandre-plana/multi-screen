import { Emitter, type Listener, type Unsubscribe } from './emitter.js';
import type { ScreenRouter } from './router.js';

export interface PlaylistItem {
  screenId: string;
  /** Time on screen, ms. */
  durationMs: number;
  /** Route params used to build the screen's path. */
  params?: Record<string, string>;
}

export interface PlaylistOptions {
  router: ScreenRouter;
  items: PlaylistItem[];
  /** Start over at the end. Default true. */
  loop?: boolean;
  /** Start immediately. Default true. */
  autoStart?: boolean;
}

export type PlaylistEvent = { type: 'item'; index: number; item: PlaylistItem } | { type: 'end' } | { type: 'state'; playing: boolean };

/**
 * Rotates screens on a device (digital signage): each item is shown for its
 * duration through the router, so URLs, history and routes stay consistent.
 * Drive it remotely with `hub.command(target, 'playlist', items)`.
 */
export class Playlist {
  readonly #router: ScreenRouter;
  readonly #events = new Emitter<PlaylistEvent>();
  #items: PlaylistItem[];
  #index = -1;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #playing = false;
  readonly loop: boolean;

  constructor(options: PlaylistOptions) {
    this.#router = options.router;
    this.#items = options.items.filter((item) => item.durationMs > 0);
    this.loop = options.loop !== false;
    if (options.autoStart !== false) this.play();
  }

  get items(): PlaylistItem[] {
    return [...this.#items];
  }

  get index(): number {
    return this.#index;
  }

  get playing(): boolean {
    return this.#playing;
  }

  /** Replaces the items; keeps playing from the first one. */
  setItems(items: PlaylistItem[]): void {
    this.#items = items.filter((item) => item.durationMs > 0);
    this.#index = -1;
    if (this.#playing) this.next();
  }

  play(): void {
    if (this.#playing) return;
    this.#playing = true;
    this.#events.emit({ type: 'state', playing: true });
    if (this.#index < 0) this.next();
    else this.#schedule();
  }

  pause(): void {
    if (!this.#playing) return;
    this.#playing = false;
    clearTimeout(this.#timer);
    this.#events.emit({ type: 'state', playing: false });
  }

  next(): void {
    this.goTo(this.#index + 1);
  }

  previous(): void {
    this.goTo(this.#index - 1 < 0 ? this.#items.length - 1 : this.#index - 1);
  }

  goTo(index: number): void {
    clearTimeout(this.#timer);
    if (this.#items.length === 0) return;
    if (index >= this.#items.length) {
      if (!this.loop) {
        this.pause();
        this.#events.emit({ type: 'end' });
        return;
      }
      index = 0;
    }
    this.#index = Math.max(0, index);
    const item = this.#items[this.#index]!;
    this.#router.navigateToScreen(item.screenId, item.params);
    this.#events.emit({ type: 'item', index: this.#index, item });
    this.#schedule();
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    if (!this.#playing) return;
    const item = this.#items[this.#index];
    if (item) this.#timer = setTimeout(() => this.next(), item.durationMs);
  }

  subscribe(listener: Listener<PlaylistEvent>): Unsubscribe {
    return this.#events.subscribe(listener);
  }

  dispose(): void {
    this.pause();
    this.#events.clear();
  }
}

export function createPlaylist(options: PlaylistOptions): Playlist {
  return new Playlist(options);
}
