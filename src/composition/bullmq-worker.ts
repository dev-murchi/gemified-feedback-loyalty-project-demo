import { BullMqJobQueue } from '../platform/queue/bullmq-job-queue.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { JobHandler } from '../shared-kernel/job-handler.js';
import type { Logger } from '../shared-kernel/logger.js';
import type { OutboxRelay } from '../shared-kernel/outbox-relay.js';
import type { JobWorker } from './job-worker.js';
import { PeriodicTasks, type PeriodicTask } from './periodic-tasks.js';

export interface BullMqWorkerDeps {
  readonly relay: OutboxRelay;
  readonly queue: BullMqJobQueue;
  /** One handler per queue name. */
  readonly handlers: Readonly<Record<string, JobHandler>>;
  readonly tasks: readonly PeriodicTask[];
  readonly clock: Clock;
  readonly logger: Logger;
}

/**
 * The worker for QUEUE_DRIVER=bullmq: BullMQ consumes the queues continuously, and a timer hands
 * the outbox to the queue and runs the periodic tasks (the 24-hour sweeper). Run it in its own
 * process (`main.worker.ts`) or, for a single-process check, inside the API with RUN_WORKER_IN_API.
 * The relay and the sweeper are safe to run in several worker processes at once: the queue keeps a
 * job id once, and closing a feedback twice changes nothing.
 */
export class BullMqWorker implements JobWorker {
  #timer: ReturnType<typeof setInterval> | undefined;
  #running: Promise<void> = Promise.resolve();
  readonly #tasks: PeriodicTasks;

  constructor(private readonly deps: BullMqWorkerDeps) {
    this.#tasks = new PeriodicTasks(deps.tasks, deps.clock);
  }

  async tick(): Promise<void> {
    await this.deps.relay.relay();
    await this.#tasks.runDue();
  }

  start(intervalMs: number): void {
    if (this.#timer !== undefined) return;
    for (const [queue, handler] of Object.entries(this.deps.handlers))
      this.deps.queue.consume(queue, handler);
    this.#timer = setInterval(() => {
      this.#running = this.#running.then(() =>
        this.tick().catch((error: unknown) =>
          this.deps.logger.warn('Queue worker tick failed', {
            error: error instanceof Error ? error.name : 'unknown',
          }),
        ),
      );
    }, intervalMs);
  }

  describe(intervalMs: number): Readonly<Record<string, unknown>> {
    return {
      driver: 'bullmq',
      queues: Object.keys(this.deps.handlers),
      ...this.deps.queue.endpoint,
      concurrency: this.deps.queue.concurrency,
      tickIntervalMs: intervalMs,
      tasks: this.deps.tasks.map(({ name, everyMs }) => ({ name, everyMs })),
    };
  }

  async stop(): Promise<void> {
    this.#stopTimer();
    await this.#running;
    await this.deps.queue.close();
  }

  async forceStop(): Promise<void> {
    this.#stopTimer();
    await this.deps.queue.abort();
  }

  #stopTimer(): void {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
