import type { DomainEvent } from './domain-event.js';

/**
 * Base for aggregate roots (docs/07 §4). It carries the version used for optimistic locking
 * (ADR-019) and the events recorded by state-changing methods. The repository hands those
 * events to the unit of work when it saves the aggregate.
 */
export abstract class AggregateRoot<Event extends DomainEvent = DomainEvent> {
  #events: Event[] = [];

  protected constructor(readonly version: number) {}

  protected recordEvent(event: Event): void {
    this.#events.push(event);
  }

  /** Returns the recorded events and clears them, so each event is published once. */
  pullEvents(): readonly Event[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }
}
