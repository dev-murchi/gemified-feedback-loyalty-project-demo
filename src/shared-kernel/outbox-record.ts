/** An event waiting to be relayed to the job queue (transactional outbox, ADR-005; SDD 6.1 OUTBOX). */
export interface OutboxRecord {
  readonly id: string;
  readonly eventType: string;
  readonly aggregateId: string;
  /**
   * The event as it was written. A database or a queue stores it as JSON, so after a trip through
   * one its dates are ISO text; whoever reads it parses it (e.g. AnalysisJobHandler).
   */
  readonly payload: unknown;
  readonly createdAt: Date;
  /** Failed hand-overs to the queue so far. */
  readonly attempts: number;
  /** Why the last hand-over failed; never the payload. */
  readonly lastError: string | null;
  /** When the queue accepted it; null while it still waits. */
  readonly publishedAt: Date | null;
  /**
   * The lease of the relay that claimed it: no other relay takes the record before this time. A
   * relay that died leaves its records to be claimed again once the lease has ended. Null while
   * nobody holds it.
   */
  readonly claimedUntil: Date | null;
}
