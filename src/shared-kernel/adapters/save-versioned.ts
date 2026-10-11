import type { AggregateRoot } from '../aggregate-root.js';
import { ConcurrencyConflictError } from '../concurrency-conflict-error.js';
import { markSaved, takeEvents } from '../repository-access.js';
import type { EventCollector } from '../unit-of-work.js';
import type { InMemoryTable } from './in-memory-table.js';

export interface VersionedRow {
  readonly version: number;
}

export interface VersionedStore<Row extends VersionedRow> {
  readonly table: InMemoryTable<string, Row>;
  readonly events: EventCollector;
}

export interface VersionedEntry<Row extends VersionedRow> {
  readonly key: string;
  readonly toRow: (version: number) => Row;
}

function write<Row extends VersionedRow>(
  store: VersionedStore<Row>,
  aggregate: AggregateRoot,
  entry: VersionedEntry<Row>,
): void {
  const storedVersion = store.table.get(entry.key)?.version ?? 0;
  if (storedVersion !== aggregate.version)
    throw new ConcurrencyConflictError(entry.key);
  const version = storedVersion + 1;
  store.table.set(entry.key, entry.toRow(version));
  store.events.collect(aggregate[takeEvents]());
  aggregate[markSaved](version);
}

/**
 * The save step every in-memory repository shares (ADR-019, docs/07 §4): the stored version (0 if
 * there is no row) must equal the aggregate's version, otherwise ConcurrencyConflictError, which
 * rolls back the unit of work. On success the row is written with the next version, the
 * aggregate's events go to the unit of work and the instance takes the stored version (markSaved).
 * Must run inside a unit of work.
 */
export function saveVersioned<Row extends VersionedRow>(
  store: VersionedStore<Row>,
  aggregate: AggregateRoot,
  entry: VersionedEntry<Row>,
): Promise<void> {
  try {
    write(store, aggregate, entry);
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
