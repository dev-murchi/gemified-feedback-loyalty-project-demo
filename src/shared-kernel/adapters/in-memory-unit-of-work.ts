import type { Clock } from '../clock.js';
import type { DomainEvent } from '../domain-event.js';
import { deliverEvents } from './event-delivery.js';
import type { EventRouting } from '../event-routing.js';
import type { IdGenerator } from '../id-generator.js';
import type { OutboxRecord } from '../outbox-record.js';
import type { EventCollector, UnitOfWork } from '../unit-of-work.js';
import type { InMemoryTable, Snapshottable } from './in-memory-table.js';

export interface InMemoryUnitOfWorkDeps {
  readonly routes: EventRouting;
  /** Every in-memory table whose changes must be undone on failure. */
  readonly tables: readonly Snapshottable[];
  readonly outbox: InMemoryTable<string, OutboxRecord>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * In-memory stand-in for a database transaction (ADR-017). Runs execute one at a time, so a
 * snapshot taken at the start can simply be restored on failure. Consequence: event handlers
 * must not call `run` themselves (they are already inside one), or the run waits on itself.
 */
export class InMemoryUnitOfWork implements UnitOfWork, EventCollector {
  readonly #deps: InMemoryUnitOfWorkDeps;
  #tail: Promise<unknown> = Promise.resolve();
  #pending: DomainEvent[] = [];
  #active = false;

  constructor(deps: InMemoryUnitOfWorkDeps) {
    this.#deps = deps;
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(() => this.#runAlone(work));
    this.#tail = result.catch(() => undefined);
    return result;
  }

  collect(events: readonly DomainEvent[]): void {
    if (!this.#active)
      throw new Error('EventCollector.collect called outside UnitOfWork.run');
    this.#pending.push(...events);
  }

  async #runAlone<T>(work: () => Promise<T>): Promise<T> {
    const restores = [...this.#deps.tables, this.#deps.outbox].map((table) =>
      table.snapshot(),
    );
    this.#active = true;
    try {
      const value = await work();
      await this.#deliverPending();
      return value;
    } catch (error) {
      restores.forEach((restore) => restore());
      throw error;
    } finally {
      this.#active = false;
      this.#pending = [];
    }
  }

  /** Handlers may record new events; deliverEvents delivers those too, in order. */
  #deliverPending(): Promise<void> {
    return deliverEvents(this.#pending, {
      routes: this.#deps.routes,
      clock: this.#deps.clock,
      ids: this.#deps.ids,
      writeToOutbox: (record) =>
        Promise.resolve(this.#deps.outbox.set(record.id, record)),
    });
  }
}
