import {
  DEFAULT_REDIS_URL,
  redisConnectionFrom,
} from '../platform/queue/redis-connection.js';
import { BullMqJobQueue } from '../platform/queue/bullmq-job-queue.js';
import { MemoryJobQueue } from '../shared-kernel/adapters/memory-job-queue.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { JobHandler } from '../shared-kernel/job-handler.js';
import type { JobQueue } from '../shared-kernel/job-queue.js';
import type { Logger } from '../shared-kernel/logger.js';
import { OutboxRelay } from '../shared-kernel/outbox-relay.js';
import type { OutboxStore } from '../shared-kernel/outbox-store.js';
import { BullMqWorker } from './bullmq-worker.js';
import { InProcessWorker } from './in-process-worker.js';
import type { JobWorker } from './job-worker.js';
import type { PeriodicTask } from './periodic-tasks.js';

/** The environment variables that choose and configure the job queue (ADR-009). */
export interface QueueEnv {
  readonly QUEUE_DRIVER?: string | undefined;
  readonly REDIS_URL?: string | undefined;
}

export type QueueDriver = 'memory' | 'bullmq';

/** QUEUE_DRIVER: `memory` (the default: tests and the single-process demo) or `bullmq` (Redis). */
export function queueDriverOf(env: QueueEnv): QueueDriver {
  const driver =
    env.QUEUE_DRIVER === undefined || env.QUEUE_DRIVER === ''
      ? 'memory'
      : env.QUEUE_DRIVER;
  if (driver !== 'memory' && driver !== 'bullmq')
    throw new Error(`Unknown QUEUE_DRIVER "${driver}"`);
  return driver;
}

export interface JobRuntimeDeps {
  readonly outbox: OutboxStore;
  /** Which queue each outbox-routed event type goes to. */
  readonly queues: Readonly<Record<string, string>>;
  /** One handler per queue name. */
  readonly handlers: Readonly<Record<string, JobHandler>>;
  readonly tasks: readonly PeriodicTask[];
  readonly clock: Clock;
  readonly logger: Logger;
}

/** The queue, the outbox relay in front of it and the worker behind it, for one driver. */
export interface JobRuntime {
  readonly queue: JobQueue;
  readonly relay: OutboxRelay;
  readonly worker: JobWorker;
}

export function createJobRuntime(
  env: QueueEnv,
  deps: JobRuntimeDeps,
): JobRuntime {
  return queueDriverOf(env) === 'memory'
    ? memoryRuntime(deps)
    : bullMqRuntime(env, deps);
}

const relayOf = (deps: JobRuntimeDeps, queue: JobQueue): OutboxRelay =>
  new OutboxRelay({
    outbox: deps.outbox,
    queue,
    queues: deps.queues,
    clock: deps.clock,
  });

function memoryRuntime(deps: JobRuntimeDeps): JobRuntime {
  const queue = new MemoryJobQueue();
  const relay = relayOf(deps, queue);
  return {
    queue,
    relay,
    worker: new InProcessWorker({ ...deps, relay, queue }),
  };
}

function bullMqRuntime(env: QueueEnv, deps: JobRuntimeDeps): JobRuntime {
  const queue = new BullMqJobQueue({
    connection: redisConnectionFrom(env.REDIS_URL ?? DEFAULT_REDIS_URL),
    clock: deps.clock,
    logger: deps.logger,
  });
  const relay = relayOf(deps, queue);
  return { queue, relay, worker: new BullMqWorker({ ...deps, relay, queue }) };
}
