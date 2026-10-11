import type { DomainEvent } from './domain-event.js';

/** Reacts to an event inside the unit of work that produced it. */
export interface EventHandler<Event extends DomainEvent = DomainEvent> {
  handle(event: Event): Promise<void>;
}

/** An event is handled synchronously in the same transaction, or written to the outbox (ADR-020). */
export type EventRoute<Event extends DomainEvent = DomainEvent> =
  { readonly sync: readonly EventHandler<Event>[] } | { readonly outbox: true };

/**
 * What the unit of work asks when it delivers an event. An event type without a route is a
 * programming error and fails the transaction.
 */
export interface EventRouting {
  routeFor(type: string): EventRoute | undefined;
}

/** A fixed table of routes; tests use it. The application registers its routes in an EventRouter. */
export type EventRoutes = Readonly<Record<string, EventRoute>>;

export const fixedRoutes = (routes: EventRoutes): EventRouting => ({
  routeFor: (type) => routes[type],
});
