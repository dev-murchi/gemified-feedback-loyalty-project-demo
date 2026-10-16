import type { DomainEvent } from './domain-event.js';

/** An event waiting to be relayed to the job queue (transactional outbox, ADR-005; SDD 6.1 OUTBOX). */
export interface OutboxRecord {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly payload: DomainEvent;
  readonly createdAt: Date;
  /** Failed hand-overs to the queue so far. */
  readonly attempts: number;
  /** Why the last hand-over failed; never the payload. */
  readonly lastError: string | null;
  /** When the queue accepted it; null while it still waits. */
  readonly publishedAt: Date | null;
}
