import { AggregateRoot } from '../../src/shared-kernel/aggregate-root.js';
import type { DomainEvent } from '../../src/shared-kernel/domain-event.js';

export type ThingTouched = DomainEvent<'ThingTouched'>;

/** The smallest aggregate that can take part in the versioned-repository contract. */
export class VersionedThing extends AggregateRoot<ThingTouched> {
  private constructor(
    readonly id: string,
    readonly label: string,
    version: number,
  ) {
    super(version);
  }

  static create(id: string, label = 'thing'): VersionedThing {
    return new VersionedThing(id, label, 0);
  }

  static reconstitute(
    id: string,
    label: string,
    version: number,
  ): VersionedThing {
    return new VersionedThing(id, label, version);
  }

  touch(at: Date): void {
    this.recordEvent({
      type: 'ThingTouched',
      aggregateId: this.id,
      occurredAt: at,
    });
  }
}
