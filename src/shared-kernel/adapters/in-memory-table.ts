/** A restore function returned by `snapshot()`; calling it puts the store back as it was. */
export type Restore = () => void;

/** In-memory storage that can take part in an in-memory unit of work. */
export interface Snapshottable {
  snapshot(): Restore;
}

/**
 * A keyed in-memory store for in-memory repositories (ADR-017). Store plain, immutable rows
 * (persisted state), never live aggregate objects: the snapshot is a shallow copy.
 */
export class InMemoryTable<Key, Row> implements Snapshottable {
  readonly #rows = new Map<Key, Row>();

  get(key: Key): Row | undefined {
    return this.#rows.get(key);
  }

  set(key: Key, row: Row): void {
    this.#rows.set(key, row);
  }

  delete(key: Key): void {
    this.#rows.delete(key);
  }

  values(): Row[] {
    return [...this.#rows.values()];
  }

  snapshot(): Restore {
    const copy = new Map(this.#rows);
    return () => {
      this.#rows.clear();
      copy.forEach((row, key) => this.#rows.set(key, row));
    };
  }
}
