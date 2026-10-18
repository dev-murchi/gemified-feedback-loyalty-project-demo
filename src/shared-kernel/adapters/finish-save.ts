import type { AggregateRoot } from '../aggregate-root.js';
import { markSaved, takeEvents } from '../repository-access.js';
import type { EventCollector } from '../unit-of-work.js';

/**
 * The last step of every repository save, in memory and in PostgreSQL alike, after the checked
 * write: hand the aggregate's recorded events to the unit of work, and set the stored version on
 * the instance, so saving the same instance again is no false conflict (docs/07 §4).
 */
export function finishSave(
  events: EventCollector,
  aggregate: AggregateRoot,
  version: number,
): void {
  events.collect(aggregate[takeEvents]());
  aggregate[markSaved](version);
}
