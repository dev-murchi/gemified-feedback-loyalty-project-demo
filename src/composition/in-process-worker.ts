import type { MemoryJobQueue } from '../shared-kernel/adapters/memory-job-queue.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { JobHandler } from '../shared-kernel/job-handler.js';
import type { Logger } from '../shared-kernel/logger.js';
import type { OutboxRelay } from '../shared-kernel/outbox-relay.js';
import type { JobWorker } from './job-worker.js';
import { PeriodicTasks, type PeriodicTask } from './periodic-tasks.js';

export interface InProcessWorkerDeps {
  readonly relay: OutboxRelay;
  readonly queue: MemoryJobQueue;
  /** One handler per queue name. */
  readonly handlers: Readonly<Record<string, JobHandler>>;
  readonly tasks: readonly PeriodicTask[];
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * The worker for the single-process demo (QUEUE_DRIVER=memory): each tick hands the outbox to the
 * in-memory queue, runs the jobs that are due, and runs the periodic tasks whose time has come. It runs on a timer only with
 * RUN_WORKER_IN_API=true; tests call `tick` themselves. The BullMQ counterpart is `BullMqWorker`.
 */
export class InProcessWorker implements JobWorker {
  #timer: ReturnType<typeof setInterval> | undefined;
  #running: Promise<void> = Promise.resolve();
  readonly #tasks: PeriodicTasks;

  constructor(private readonly deps: InProcessWorkerDeps) {
    this.#tasks = new PeriodicTasks(deps.tasks, deps.clock);
  }

  async tick(): Promise<void> {
    await this.deps.relay.relay();
    await this.#runQueues();
    await this.#tasks.runDue();
  }

  async #runQueues(): Promise<void> {
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

  describe(intervalMs: number): Readonly<Record<string, unknown>> {
    return {
      driver: 'memory',
      queues: Object.keys(this.deps.handlers),
      concurrency: 1,
      tickIntervalMs: intervalMs,
      tasks: this.deps.tasks.map(({ name, everyMs }) => ({ name, everyMs })),
    };
  }

  async stop(): Promise<void> {
    this.#stopTimer();
    await this.#running;
  }

  forceStop(): Promise<void> {
    this.#stopTimer();
    return Promise.resolve();
  }

  #stopTimer(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
