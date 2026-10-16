/** One job for a queue; `id` makes enqueueing idempotent. */
export interface QueuedJob {
  readonly queue: string;
  /** Enqueueing an id the queue already has (waiting, running or done) does nothing. */
  readonly id: string;
  readonly payload: unknown;
  /** Not to be run before this time; now when absent. */
  readonly runAt?: Date;
}

/**
 * The job queue behind a port (ADR-009, `QUEUE_DRIVER`): BullMQ in production, in memory for tests
 * and the single-process demo. Consistency comes from the outbox, so the queue only has to accept
 * each job id once; the relay may hand the same job over again after a crash.
 */
export interface JobQueue {
  enqueue(job: QueuedJob): Promise<void>;
}
