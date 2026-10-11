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

/**
 * Optimistic lock (ADR-019, docs/07 §4): the stored version (0 if there is no row) must equal the
 * aggregate's version, otherwise ConcurrencyConflictError. Returns the stored version.
 */
export function checkVersion<Row extends VersionedRow>(
  table: InMemoryTable<string, Row>,
  key: string,
  aggregate: AggregateRoot,
): number {
  const storedVersion = table.get(key)?.version ?? 0;
  if (storedVersion !== aggregate.version)
    throw new ConcurrencyConflictError(key);
  return storedVersion;
}

/** A checked write: the entry plus the stored version that checkVersion returned. */
export interface VersionedWrite<
  Row extends VersionedRow,
> extends VersionedEntry<Row> {
  readonly storedVersion: number;
}

/**
 * Writes the row with the next version, hands the aggregate's events to the unit of work and sets
 * the stored version on the instance (markSaved). Call only after checkVersion and every other
 * check, so nothing is written when a check fails.
 */
export function commitVersioned<Row extends VersionedRow>(
  store: VersionedStore<Row>,
  aggregate: AggregateRoot,
  write: VersionedWrite<Row>,
): void {
  const version = write.storedVersion + 1;
  store.table.set(write.key, write.toRow(version));
  store.events.collect(aggregate[takeEvents]());
  aggregate[markSaved](version);
}

/** Runs synchronous repository work and reports a thrown error as a rejected promise. */
export function asPromise(work: () => void): Promise<void> {
  try {
    work();
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * The save step every in-memory repository shares: checkVersion, then commitVersioned. A conflict
 * rolls back the unit of work. Must run inside a unit of work.
 */
export function saveVersioned<Row extends VersionedRow>(
  store: VersionedStore<Row>,
  aggregate: AggregateRoot,
  entry: VersionedEntry<Row>,
): Promise<void> {
  return asPromise(() => {
    const storedVersion = checkVersion(store.table, entry.key, aggregate);
    commitVersioned(store, aggregate, { ...entry, storedVersion });
  });
}
