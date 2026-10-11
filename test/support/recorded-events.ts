import type { AggregateRoot } from '../../src/shared-kernel/aggregate-root.js';
import type { DomainEvent } from '../../src/shared-kernel/domain-event.js';
import { takeEvents } from '../../src/shared-kernel/repository-access.js';

/** Takes an aggregate's recorded events in a test, the way a repository does on save. */
export const takeRecordedEvents = <Event extends DomainEvent>(
  aggregate: AggregateRoot<Event>,
): readonly Event[] => aggregate[takeEvents]();
