/** A restore function returned by `snapshot()`; calling it puts the store back as it was. */
export type Restore = () => void;

/** In-memory storage that can take part in an in-memory unit of work. */
export interface Snapshottable {
  snapshot(): Restore;
}

/**
 * A keyed in-memory store for in-memory repositories (ADR-017). Rows are deep-copied on the way
 * in and on the way out, so no caller ever holds a stored object: changing a saved or loaded
 * object never changes stored state, and the snapshot can stay a shallow copy.
 *
 * Rows must be plain data. structuredClone throws on functions, but it silently turns a class
 * instance into a plain object (methods and prototype are lost), so storing an aggregate here
 * would not fail loudly. Repository contract tests check that rows are plain (docs/07 §4).
 */
export class InMemoryTable<Key, Row> implements Snapshottable {
  readonly #rows = new Map<Key, Row>();

  get(key: Key): Row | undefined {
    const row = this.#rows.get(key);
    return row === undefined ? undefined : structuredClone(row);
  }

  set(key: Key, row: Row): void {
    this.#rows.set(key, structuredClone(row));
  }

  delete(key: Key): void {
    this.#rows.delete(key);
  }

  values(): Row[] {
    return [...this.#rows.values()].map((row) => structuredClone(row));
  }

  snapshot(): Restore {
    const copy = new Map(this.#rows);
    return () => {
      this.#rows.clear();
      copy.forEach((row, key) => this.#rows.set(key, row));
    };
  }
}
