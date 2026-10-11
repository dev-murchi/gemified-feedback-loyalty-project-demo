import type { AggregateRoot } from '../../src/shared-kernel/aggregate-root.js';
import type { DomainEvent } from '../../src/shared-kernel/domain-event.js';
import {
  markSaved,
  takeEvents,
} from '../../src/shared-kernel/repository-access.js';

/** Takes an aggregate's recorded events in a test, the way a repository does on save. */
export const takeRecordedEvents = <Event extends DomainEvent>(
  aggregate: AggregateRoot<Event>,
): readonly Event[] => aggregate[takeEvents]();

/** Marks an aggregate as saved at `version` in a test, the way a repository does. */
export const markAggregateSaved = (
  aggregate: AggregateRoot,
  version: number,
): void => aggregate[markSaved](version);
