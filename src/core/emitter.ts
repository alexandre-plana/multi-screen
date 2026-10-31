/** Minimal, dependency-free event emitter. */
export type Listener<T> = (value: T) => void;
export type Unsubscribe = () => void;

export class Emitter<T> {
  #listeners = new Set<Listener<T>>();

  subscribe(listener: Listener<T>): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  emit(value: T): void {
    for (const listener of [...this.#listeners]) {
      try {
        listener(value);
      } catch (error) {
        // A faulty listener must not break the others.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  get size(): number {
    return this.#listeners.size;
  }

  clear(): void {
    this.#listeners.clear();
  }
}
