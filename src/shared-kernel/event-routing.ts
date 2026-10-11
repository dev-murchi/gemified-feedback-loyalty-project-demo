import type { DomainEvent } from './domain-event.js';

/** Reacts to an event inside the unit of work that produced it. */
export interface EventHandler<Event extends DomainEvent = DomainEvent> {
  handle(event: Event): Promise<void>;
}

/** An event is handled synchronously in the same transaction, or written to the outbox (ADR-020). */
export type EventRoute =
  { readonly sync: readonly EventHandler[] } | { readonly outbox: true };

/**
 * Event type → route. Built once in the composition root, the only place that sees every
 * context. An event type without a route is a programming error and fails the transaction.
 */
export type EventRoutes = Readonly<Record<string, EventRoute>>;
