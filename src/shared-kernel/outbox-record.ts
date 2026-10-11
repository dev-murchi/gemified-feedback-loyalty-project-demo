import type { DomainEvent } from './domain-event.js';

/** An event waiting to be relayed to the job queue (transactional outbox, ADR-005). */
export interface OutboxRecord {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly payload: DomainEvent;
  readonly createdAt: Date;
}
