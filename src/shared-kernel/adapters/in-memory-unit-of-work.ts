import type { Clock } from '../clock.js';
import type { DomainEvent } from '../domain-event.js';
import type { EventRoutes } from '../event-routing.js';
import type { IdGenerator } from '../id-generator.js';
import type { OutboxRecord } from '../outbox-record.js';
import type { EventCollector, UnitOfWork } from '../unit-of-work.js';
import type { InMemoryTable, Snapshottable } from './in-memory-table.js';

export interface InMemoryUnitOfWorkDeps {
  readonly routes: EventRoutes;
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

  /** Handlers may record new events; the loop delivers those too, in order. */
  async #deliverPending(): Promise<void> {
    for (
      let event = this.#pending.shift();
      event;
      event = this.#pending.shift()
    ) {
      await this.#deliver(event);
    }
  }

  async #deliver(event: DomainEvent): Promise<void> {
    const route = this.#deps.routes[event.type];
    if (route === undefined)
      throw new Error(`No route for event type "${event.type}"`);
    if ('outbox' in route) {
      this.#writeToOutbox(event);
      return;
    }
    for (const handler of route.sync) await handler.handle(event);
  }

  #writeToOutbox(event: DomainEvent): void {
    const record: OutboxRecord = {
      id: this.#deps.ids.next(),
      eventType: event.type,
      aggregateId: event.aggregateId,
      payload: event,
      createdAt: this.#deps.clock.now(),
    };
    this.#deps.outbox.set(record.id, record);
  }
}
