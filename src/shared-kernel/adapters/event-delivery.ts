import type { Clock } from '../clock.js';
import type { DomainEvent } from '../domain-event.js';
import type { EventRouting } from '../event-routing.js';
import type { IdGenerator } from '../id-generator.js';
import type { OutboxRecord } from '../outbox-record.js';

/** What a unit of work needs to deliver the events collected during its work. */
export interface EventDeliveryDeps {
  readonly routes: EventRouting;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** Writes the record inside the same transaction as the work. */
  readonly writeToOutbox: (record: OutboxRecord) => Promise<void>;
}

/** A new, unpublished outbox record holding the event (ADR-005). */
export const outboxRecordFor = (
  event: DomainEvent,
  deps: Pick<EventDeliveryDeps, 'clock' | 'ids'>,
): OutboxRecord => ({
  id: deps.ids.next(),
  eventType: event.type,
  aggregateId: event.aggregateId,
  payload: event,
  createdAt: deps.clock.now(),
  attempts: 0,
  lastError: null,
  publishedAt: null,
  claimedUntil: null,
});

async function deliver(
  event: DomainEvent,
  deps: EventDeliveryDeps,
): Promise<void> {
  const route = deps.routes.routeFor(event.type);
  if (route === undefined)
    throw new Error(`No route for event type "${event.type}"`);
  if ('outbox' in route) {
    await deps.writeToOutbox(outboxRecordFor(event, deps));
    return;
  }
  for (const handler of route.sync) await handler.handle(event);
}

/**
 * Delivers the events of one unit of work in order (ADR-020): synchronous handlers run inside the
 * transaction, outbox-routed events become outbox records. `pending` is consumed; handlers may
 * collect new events into it, and those are delivered too. An event without a route throws, so
 * the unit of work fails.
 */
export async function deliverEvents(
  pending: DomainEvent[],
  deps: EventDeliveryDeps,
): Promise<void> {
  for (let event = pending.shift(); event; event = pending.shift()) {
    await deliver(event, deps);
  }
}
