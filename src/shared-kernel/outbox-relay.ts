import type { Clock } from './clock.js';
import { reasonOf } from './failure-reason.js';
import type { JobQueue } from './job-queue.js';
import type { OutboxStore } from './outbox-store.js';

export interface OutboxRelayDeps {
  readonly outbox: OutboxStore;
  readonly queue: JobQueue;
  /** Which queue each outbox-routed event type goes to, e.g. FeedbackSubmitted → analysis. */
  readonly queues: Readonly<Record<string, string>>;
  readonly clock: Clock;
}

export interface RelayResult {
  readonly published: number;
  readonly failed: number;
}

const DEFAULT_BATCH = 100;

/**
 * Hands outbox records to the job queue (ADR-005, TZ-4): enqueue first, then mark published. A
 * crash between the two hands the same record over again with the same job id, which the queue
 * ignores, so every job runs once although delivery is at least once. A failed hand-over is
 * counted and retried on the next run; one failure never stops the batch.
 */
export class OutboxRelay {
  constructor(private readonly deps: OutboxRelayDeps) {}

  async relay(limit = DEFAULT_BATCH): Promise<RelayResult> {
    const records = await this.deps.outbox.unpublished(limit);
    let published = 0;
    for (const record of records) {
      const queue = this.deps.queues[record.eventType];
      try {
        if (queue === undefined)
          throw new Error(`No queue for event type "${record.eventType}"`);
        await this.deps.queue.enqueue({
          queue,
          id: record.id,
          payload: record.payload,
        });
        await this.deps.outbox.markPublished(record.id, this.deps.clock.now());
        published += 1;
      } catch (error) {
        await this.deps.outbox.markFailed(record.id, reasonOf(error));
      }
    }
    return { published, failed: records.length - published };
  }
}
