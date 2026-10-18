import type { Clock } from './clock.js';
import { reasonOf } from './failure-reason.js';
import type { JobQueue } from './job-queue.js';
import type { Logger } from './logger.js';
import type { ClaimedOutboxRecord, OutboxStore } from './outbox-store.js';

export interface OutboxRelayDeps {
  readonly outbox: OutboxStore;
  readonly queue: JobQueue;
  /** Which queue each outbox-routed event type goes to, e.g. FeedbackSubmitted → analysis. */
  readonly queues: Readonly<Record<string, string>>;
  readonly clock: Clock;
  readonly logger: Logger;
  /** How long a claimed record is the relay's alone; default 30 seconds. */
  readonly leaseMs?: number;
}

export interface RelayResult {
  readonly published: number;
  readonly failed: number;
}

type Outcome = 'published' | 'failed' | 'lost';

const DEFAULT_BATCH = 100;
const DEFAULT_LEASE_MS = 30_000;

/**
 * Hands outbox records to the job queue (ADR-005, TZ-4): claim a batch for a lease, enqueue each
 * record, then mark it published. Nothing here runs inside a transaction: the claim is its own short
 * step, so the call to the queue never holds a database transaction or a row lock (docs/07 §5).
 *
 * Relays may run side by side (one per worker process). A claimed record is skipped by the others
 * until its lease ends, so they take different records. If a relay dies, its records are claimed
 * again after the lease. A crash between enqueue and mark, or a lease that ended while the batch was
 * still going, hands the same record over again with the same job id, which the queue ignores, so
 * every job runs once although delivery is at least once. A failed hand-over is counted and retried
 * on the next run; one failure never stops the batch.
 *
 * Every mark presents the lease the relay was handed. When the lease has passed to another relay the
 * mark changes nothing: the record is that relay's now. It counts as neither published nor failed,
 * and the batch carries on; one warning per batch says how many (a sign that the lease is too short
 * for the queue's speed).
 */
export class OutboxRelay {
  constructor(private readonly deps: OutboxRelayDeps) {}

  async relay(limit = DEFAULT_BATCH): Promise<RelayResult> {
    const records = await this.deps.outbox.claim(
      limit,
      this.deps.clock.now(),
      this.deps.leaseMs ?? DEFAULT_LEASE_MS,
    );
    const count: Record<Outcome, number> = { published: 0, failed: 0, lost: 0 };
    for (const record of records) count[await this.#handOver(record)] += 1;
    if (count.lost > 0)
      this.deps.logger.warn(
        'Outbox lease passed to another relay before the records were marked',
        { records: count.lost },
      );
    return { published: count.published, failed: count.failed };
  }

  async #handOver(record: ClaimedOutboxRecord): Promise<Outcome> {
    const { outbox, clock } = this.deps;
    try {
      await this.#enqueue(record);
      const marked = await outbox.markPublished(record, clock.now());
      return marked ? 'published' : 'lost';
    } catch (error) {
      const marked = await outbox.markFailed(record, reasonOf(error));
      return marked ? 'failed' : 'lost';
    }
  }

  #enqueue(record: ClaimedOutboxRecord): Promise<void> {
    const queue = this.deps.queues[record.eventType];
    if (queue === undefined)
      throw new Error(`No queue for event type "${record.eventType}"`);
    return this.deps.queue.enqueue({
      queue,
      id: record.id,
      payload: record.payload,
    });
  }
}
