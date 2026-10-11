import type { DomainEvent } from './domain-event.js';
import { markSaved, takeEvents } from './repository-access.js';

/**
 * Base for aggregate roots (docs/07 §4). It carries the version used for optimistic locking
 * (ADR-019) and the events recorded by state-changing methods. Only the repository takes those
 * events, with the `takeEvents` key, and hands them to the unit of work when it saves.
 *
 * Version 0 means "never stored" (new, or restored from a snapshot): saving it is an insert.
 */
export abstract class AggregateRoot<Event extends DomainEvent = DomainEvent> {
  #events: Event[] = [];
  #version: number;

  protected constructor(version: number) {
    this.#version = version;
  }

  /** The stored version this instance is based on. */
  get version(): number {
    return this.#version;
  }

  protected recordEvent(event: Event): void {
    this.#events.push(event);
  }

  /** Returns the recorded events and clears them, so each event is published once. */
  [takeEvents](): readonly Event[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }

  /** Called by the repository after a successful save, so a second save is not a false conflict. */
  [markSaved](version: number): void {
    this.#version = version;
  }
}
