import {
  DelayedError,
  Queue,
  Worker,
  type Job,
  type RedisOptions,
} from 'bullmq';
import type { Clock } from '../../shared-kernel/clock.js';
import { reasonOf } from '../../shared-kernel/failure-reason.js';
import {
  JOB_FAILURE_BACKOFF,
  failureDelayMs,
} from '../../shared-kernel/job-failure-backoff.js';
import type { JobHandler } from '../../shared-kernel/job-handler.js';
import type { JobQueue, QueuedJob } from '../../shared-kernel/job-queue.js';
import type { Logger } from '../../shared-kernel/logger.js';
import { RedisMonitor, endpointOf } from './redis-monitor.js';

export interface BullMqJobQueueDeps {
  readonly connection: RedisOptions;
  readonly clock: Clock;
  readonly logger: Logger;
  /** The Redis key prefix; a test uses its own so that runs never meet. */
  readonly prefix?: string;
  /** The wait after a thrown failure; the shared policy unless a test shortens it. */
  readonly failureDelayMs?: (failedAttempts: number) => number;
}

/** What a job stores: the payload and the run time that was asked for, kept as asked. */
interface Envelope {
  readonly payload: unknown;
  readonly runAt?: string;
}

const DEFAULT_PREFIX = 'bull';
/** Jobs one worker runs at the same time (BullMQ's default, stated so that the log can say it). */
const CONCURRENCY = 1;
/** Finished jobs stay this long, so that a job id the relay hands over again after a crash is still known. */
const KEEP_DONE_SECONDS = 7 * 24 * 60 * 60;
const ALL_STATES = [
  'waiting',
  'delayed',
  'active',
  'completed',
  'failed',
] as const;

/**
 * The job queue on Redis (QUEUE_DRIVER=bullmq, ADR-009, ADR-011). The outbox id is the BullMQ job
 * id, so a job handed over twice is kept once. A planned retry (`retry` from the handler) moves the
 * job to a later time without using an attempt; a thrown error uses JOB_FAILURE_BACKOFF (custom
 * backoff, 5 attempts in all) and then stays in the failed set for inspection.
 */
export class BullMqJobQueue implements JobQueue {
  readonly #queues = new Map<string, Queue<Envelope>>();
  readonly #workers: Worker<Envelope>[] = [];
  readonly #monitor: RedisMonitor;

  /** How many jobs one consumer runs at the same time. */
  readonly concurrency = CONCURRENCY;

  constructor(private readonly deps: BullMqJobQueueDeps) {
    this.#monitor = new RedisMonitor({
      connection: deps.connection,
      logger: deps.logger,
    });
  }

  /** Redis host and port for the log: never the password or the full URL. */
  get endpoint(): ReturnType<typeof endpointOf> {
    return endpointOf(this.deps.connection);
  }

  async enqueue(job: QueuedJob): Promise<void> {
    const envelope: Envelope =
      job.runAt === undefined
        ? { payload: job.payload }
        : { payload: job.payload, runAt: job.runAt.toISOString() };
    await this.#queueOf(job.queue).add(job.queue, envelope, {
      jobId: job.id,
      delay: this.#delayMs(job.runAt),
      attempts: JOB_FAILURE_BACKOFF.maxAttempts,
      backoff: { type: 'custom' },
      removeOnComplete: { age: KEEP_DONE_SECONDS },
    });
  }

  /** The jobs of a queue in any state, in the order they were accepted. */
  async jobsOf(queue: string): Promise<readonly QueuedJob[]> {
    const jobs = await this.#queueOf(queue).getJobs([...ALL_STATES]);
    return jobs
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((job) => toQueuedJob(queue, job));
  }

  /** Starts consuming a queue; each job runs the handler. */
  consume(queue: string, handler: JobHandler): void {
    this.#monitor.start();
    const worker = new Worker<Envelope>(
      queue,
      (job, token) => this.#process(job, token, handler),
      {
        connection: this.deps.connection,
        prefix: this.#prefix,
        concurrency: CONCURRENCY,
        settings: {
          backoffStrategy: (attempts) => this.#failureDelay(attempts),
        },
      },
    );
    worker.on('failed', (job, error) => this.#reportFailure(queue, job, error));
    worker.on('error', (error) =>
      this.deps.logger.warn('Queue worker error', { error: reasonOf(error) }),
    );
    this.#workers.push(worker);
  }

  /**
   * Stops consuming: a job that is running is allowed to finish (BullMQ waits for it), then the
   * queues and the Redis connections are closed.
   */
  async close(): Promise<void> {
    await Promise.all(this.#workers.map((worker) => worker.close()));
    await Promise.all([...this.#queues.values()].map((queue) => queue.close()));
    await this.#monitor.stop();
    this.#workers.length = 0;
    this.#queues.clear();
  }

  /**
   * Closes every connection at once, without waiting for a running job. Its job keeps its lock
   * until it expires; BullMQ then finds it stalled and runs it again (at least once).
   */
  async abort(): Promise<void> {
    const connections = [...this.#workers, ...this.#queues.values()];
    await Promise.all(connections.map((connection) => connection.disconnect()));
    await this.#monitor.stop();
  }

  get #prefix(): string {
    return this.deps.prefix ?? DEFAULT_PREFIX;
  }

  #queueOf(name: string): Queue<Envelope> {
    const existing = this.#queues.get(name);
    if (existing !== undefined) return existing;
    this.#monitor.start();
    const queue = new Queue<Envelope>(name, {
      connection: this.deps.connection,
      prefix: this.#prefix,
    });
    queue.on('error', (error) =>
      this.deps.logger.warn('Queue error', { error: reasonOf(error) }),
    );
    this.#queues.set(name, queue);
    return queue;
  }

  #delayMs(runAt: Date | undefined): number {
    if (runAt === undefined) return 0;
    return Math.max(runAt.getTime() - this.deps.clock.now().getTime(), 0);
  }

  #failureDelay(failedAttempts: number): number {
    return (this.deps.failureDelayMs ?? failureDelayMs)(failedAttempts);
  }

  async #process(
    job: Job<Envelope>,
    token: string | undefined,
    handler: JobHandler,
  ): Promise<void> {
    const result = await handler.handle(job.data.payload);
    if (result.outcome === 'done') return;
    await job.moveToDelayed(result.at.getTime(), token);
    throw new DelayedError();
  }

  /** Logs a job given up after its last attempt: its id and error, never its payload. */
  #reportFailure(
    queue: string,
    job: Job<Envelope> | undefined,
    error: Error,
  ): void {
    if (job === undefined) return;
    const allowed = job.opts.attempts ?? 1;
    if (job.attemptsMade < allowed) return;
    this.deps.logger.warn('Job failed for good after its last attempt', {
      queue,
      jobId: job.id,
      attempts: job.attemptsMade,
      error: reasonOf(error),
    });
  }
}

function toQueuedJob(queue: string, job: Job<Envelope>): QueuedJob {
  const { payload, runAt } = job.data;
  const base = { queue, id: job.id ?? '', payload };
  return runAt === undefined ? base : { ...base, runAt: new Date(runAt) };
}
