import { finishSave } from '../../../src/shared-kernel/adapters/finish-save.js';
import type { DomainEvent } from '../../../src/shared-kernel/domain-event.js';
import type { EventCollector } from '../../../src/shared-kernel/unit-of-work.js';
import { VersionedThing } from '../../support/versioned-thing.js';

const collector = () => {
  const collected: DomainEvent[] = [];
  const events: EventCollector = {
    collect: (batch) => void collected.push(...batch),
  };
  return { events, collected };
};

describe('finishSave', () => {
  it("hands the aggregate's events to the unit of work and sets the stored version on it", () => {
    // Given an aggregate that recorded an event and is based on version 1
    const { events, collected } = collector();
    const thing = VersionedThing.reconstitute('thing-1', 'label', 1);
    thing.touch(new Date('2026-10-18T09:00:00.000Z'));

    // When the save is finished at version 2
    finishSave(events, thing, 2);

    // Then the event was collected and the instance knows its stored version
    expect(collected.map((event) => event.type)).toEqual(['ThingTouched']);
    expect(thing.version).toBe(2);
  });

  it('collects an event only once, however often the same instance is saved', () => {
    const { events, collected } = collector();
    const thing = VersionedThing.create('thing-1');
    thing.touch(new Date('2026-10-18T09:00:00.000Z'));

    finishSave(events, thing, 1);
    finishSave(events, thing, 2);

    expect(collected).toHaveLength(1);
    expect(thing.version).toBe(2);
  });
});
