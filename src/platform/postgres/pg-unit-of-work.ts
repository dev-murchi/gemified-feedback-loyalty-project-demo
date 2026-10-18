import { AsyncLocalStorage } from 'node:async_hooks';
import type { Clock } from '../../shared-kernel/clock.js';
import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import { deliverEvents } from '../../shared-kernel/adapters/event-delivery.js';
import type { EventRouting } from '../../shared-kernel/event-routing.js';
import type { IdGenerator } from '../../shared-kernel/id-generator.js';
import type {
  EventCollector,
  UnitOfWork,
} from '../../shared-kernel/unit-of-work.js';
import type { PgDatabase } from './pg-database.js';
import { insertOutboxRecord } from './pg-outbox-store.js';

export interface PgUnitOfWorkDeps {
  readonly db: PgDatabase;
  readonly routes: EventRouting;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * A unit of work as one PostgreSQL transaction (ADR-014, ADR-020). Unlike the in-memory version,
 * units of work run concurrently, each on its own connection; the version checks in the
 * repositories (ADR-019) decide who wins. Each run keeps its own list of collected events, so
 * concurrent runs never deliver each other's events. A handler that opens another unit of work
 * fails at once instead of waiting on itself.
 */
export class PgUnitOfWork implements UnitOfWork, EventCollector {
  readonly #pending = new AsyncLocalStorage<DomainEvent[]>();

  constructor(private readonly deps: PgUnitOfWorkDeps) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    const pending: DomainEvent[] = [];
    return this.deps.db.transaction(() =>
      this.#pending.run(pending, async () => {
        const value = await work();
        await deliverEvents(pending, {
          routes: this.deps.routes,
          clock: this.deps.clock,
          ids: this.deps.ids,
          writeToOutbox: (record) => insertOutboxRecord(this.deps.db, record),
        });
        return value;
      }),
    );
  }

  collect(events: readonly DomainEvent[]): void {
    const pending = this.#pending.getStore();
    if (pending === undefined)
      throw new Error('EventCollector.collect called outside UnitOfWork.run');
    pending.push(...events);
  }
}
