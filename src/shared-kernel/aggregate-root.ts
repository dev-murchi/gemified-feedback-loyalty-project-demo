import type { DomainEvent } from './domain-event.js';
import { takeEvents } from './repository-access.js';

/**
 * Base for aggregate roots (docs/07 §4). It carries the version used for optimistic locking
 * (ADR-019) and the events recorded by state-changing methods. Only the repository takes those
 * events, with the `takeEvents` key, and hands them to the unit of work when it saves.
 */
export abstract class AggregateRoot<Event extends DomainEvent = DomainEvent> {
  #events: Event[] = [];

  protected constructor(readonly version: number) {}

  protected recordEvent(event: Event): void {
    this.#events.push(event);
  }

  /** Returns the recorded events and clears them, so each event is published once. */
  [takeEvents](): readonly Event[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }
}
