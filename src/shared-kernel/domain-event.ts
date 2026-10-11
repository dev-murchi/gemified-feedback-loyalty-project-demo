/**
 * Something that happened in the domain, named in the past tense and immutable (docs/06 §6).
 * `aggregateId` identifies the aggregate that recorded it; it is also the outbox key.
 */
export interface DomainEvent<Type extends string = string> {
  readonly type: Type;
  readonly aggregateId: string;
  readonly occurredAt: Date;
}
