import { AggregateRoot } from '../../../src/shared-kernel/aggregate-root.js';
import type { DomainEvent } from '../../../src/shared-kernel/domain-event.js';
import {
  markAggregateSaved,
  takeRecordedEvents,
} from '../../support/aggregate-access.js';

const OCCURRED_AT = new Date('2026-10-12T09:00:00.000Z');

class Counter extends AggregateRoot {
  static load(version: number): Counter {
    return new Counter(version);
  }

  increment(): void {
    this.recordEvent({
      type: 'CounterIncremented',
      aggregateId: 'counter-1',
      occurredAt: OCCURRED_AT,
    });
  }
}

describe('AggregateRoot', () => {
  it('keeps the version it was loaded with', () => {
    // Given an aggregate loaded at version 3
    // When it is created
    const counter = Counter.load(3);

    // Then it reports that version
    expect(counter.version).toBe(3);
  });

  it('takes the stored version after a save, so the same instance can be saved again', () => {
    // Given a new aggregate (version 0)
    const counter = Counter.load(0);

    // When a repository marks it saved at version 1
    markAggregateSaved(counter, 1);

    // Then it reports the stored version
    expect(counter.version).toBe(1);
  });

  it('returns recorded events once, so each is published once', () => {
    // Given an aggregate that recorded two events
    const counter = Counter.load(0);
    counter.increment();
    counter.increment();

    // When the events are pulled twice
    const first: readonly DomainEvent[] = takeRecordedEvents(counter);
    const second = takeRecordedEvents(counter);

    // Then the first pull has both events and the second has none
    expect(first.map((event) => event.type)).toEqual([
      'CounterIncremented',
      'CounterIncremented',
    ]);
    expect(second).toEqual([]);
  });
});
