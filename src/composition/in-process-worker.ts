import type { MemoryJobQueue } from '../shared-kernel/adapters/memory-job-queue.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { JobHandler } from '../shared-kernel/job-handler.js';
import type { Logger } from '../shared-kernel/logger.js';
import type { OutboxRelay } from '../shared-kernel/outbox-relay.js';

export interface InProcessWorkerDeps {
  readonly relay: OutboxRelay;
  readonly queue: MemoryJobQueue;
  /** One handler per queue name. */
  readonly handlers: Readonly<Record<string, JobHandler>>;
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * The worker for the single-process demo (QUEUE_DRIVER=memory): each tick hands the outbox to the
 * in-memory queue and runs the jobs that are due. It runs on a timer only with
 * RUN_WORKER_IN_API=true; tests call `tick` themselves. The separate worker process with BullMQ
 * (`main.worker.ts`) comes with the Redis queue in slice 4.
 */
export class InProcessWorker {
  #timer: ReturnType<typeof setInterval> | undefined;
  #running: Promise<void> = Promise.resolve();

  constructor(private readonly deps: InProcessWorkerDeps) {}

  async tick(): Promise<void> {
    await this.deps.relay.relay();
    for (const [queue, handler] of Object.entries(this.deps.handlers)) {
      const report = await this.deps.queue.runDue(
        queue,
        handler,
        this.deps.clock.now(),
      );
      for (const failed of report.failedForGood)
        this.deps.logger.warn('Job failed for good after its last attempt', {
          queue,
          jobId: failed.job.id,
          attempts: failed.failures,
          error: failed.lastError,
        });
    }
  }

  /** Ticks every `intervalMs`, never two at once; a tick that throws is logged, the timer goes on. */
  start(intervalMs: number): void {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(() => {
      this.#running = this.#running.then(() =>
        this.tick().catch((error: unknown) =>
          this.deps.logger.warn('In-process worker tick failed', {
            error: error instanceof Error ? error.name : 'unknown',
          }),
        ),
      );
    }, intervalMs);
  }

  async stop(): Promise<void> {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
    await this.#running;
  }
}
