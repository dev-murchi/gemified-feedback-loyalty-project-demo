import type { MemoryJobQueue } from '../shared-kernel/adapters/memory-job-queue.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { JobHandler } from '../shared-kernel/job-handler.js';
import type { Logger } from '../shared-kernel/logger.js';
import type { OutboxRelay } from '../shared-kernel/outbox-relay.js';

/** A job the worker runs on a schedule (e.g. the 24-hour sweeper), at most once per `everyMs`. */
export interface PeriodicTask {
  readonly name: string;
  readonly everyMs: number;
  run(): Promise<void>;
}

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
 * RUN_WORKER_IN_API=true; tests call `tick` themselves. The separate worker process with BullMQ
 * (`main.worker.ts`) comes with the Redis queue in slice 4.
 */
export class InProcessWorker {
  #timer: ReturnType<typeof setInterval> | undefined;
  #running: Promise<void> = Promise.resolve();
  readonly #lastRun = new Map<string, number>();

  constructor(private readonly deps: InProcessWorkerDeps) {}

  async tick(): Promise<void> {
    await this.deps.relay.relay();
    await this.#runQueues();
    await this.#runDueTasks();
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

  /** Each task runs on the first tick, then once `everyMs` has passed by the application clock. */
  async #runDueTasks(): Promise<void> {
    const now = this.deps.clock.now().getTime();
    for (const task of this.deps.tasks) {
      const last = this.#lastRun.get(task.name);
      if (last !== undefined && now - last < task.everyMs) continue;
      this.#lastRun.set(task.name, now);
      await task.run();
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
