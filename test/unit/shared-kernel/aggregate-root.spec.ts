import { AggregateRoot } from '../../../src/shared-kernel/aggregate-root.js';
import type { DomainEvent } from '../../../src/shared-kernel/domain-event.js';

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

  it('returns recorded events once, so each is published once', () => {
    // Given an aggregate that recorded two events
    const counter = Counter.load(0);
    counter.increment();
    counter.increment();

    // When the events are pulled twice
    const first: readonly DomainEvent[] = counter.pullEvents();
    const second = counter.pullEvents();

    // Then the first pull has both events and the second has none
    expect(first.map((event) => event.type)).toEqual([
      'CounterIncremented',
      'CounterIncremented',
    ]);
    expect(second).toEqual([]);
  });
});
