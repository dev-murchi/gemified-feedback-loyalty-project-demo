import type { AggregateRoot } from '../../shared-kernel/aggregate-root.js';
import { finishSave } from '../../shared-kernel/adapters/finish-save.js';
import type { EventCollector } from '../../shared-kernel/unit-of-work.js';
import {
  writeVersioned,
  type SqlRunner,
  type VersionedRowWrite,
} from './versioned-write.js';

/** What a PostgreSQL repository saves through: the connection and the unit of work's collector. */
export interface VersionedStore {
  readonly db: SqlRunner;
  readonly events: EventCollector;
}

/**
 * The save step every PostgreSQL repository shares, like shared-kernel's `saveVersioned` for the
 * in-memory ones: the checked write, then the aggregate's events to the unit of work, then the
 * stored version on the instance, so saving the same instance twice is no false conflict. When
 * the write conflicts nothing after it runs, and the unit of work rolls back.
 */
export async function saveVersioned(
  store: VersionedStore,
  aggregate: AggregateRoot,
  write: Omit<VersionedRowWrite, 'version'>,
): Promise<void> {
  const version = await writeVersioned(store.db, {
    ...write,
    version: aggregate.version,
  });
  finishSave(store.events, aggregate, version);
}
