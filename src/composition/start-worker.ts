import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import type { Logger } from '../shared-kernel/logger.js';
import { reasonOf } from '../shared-kernel/failure-reason.js';
import type { JobWorker } from './job-worker.js';
import { JOB_WORKER, LOGGER } from './tokens.js';
import { WorkerAppModule } from './worker-app.module.js';

const DEFAULT_INTERVAL_MS = 1_000;
/** Below the 30 s an ECS task gets between SIGTERM and SIGKILL. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 25_000;
const STOP_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

type StopSignal = (typeof STOP_SIGNALS)[number];

/** Where the stop signals come from: the process, or an emitter in a test. */
export interface SignalSource {
  on(signal: StopSignal, listener: () => void): unknown;
  off(signal: StopSignal, listener: () => void): unknown;
}

export interface RunWorkerOptions {
  readonly signals?: SignalSource;
  readonly shutdownTimeoutMs?: number;
}

export interface RunningWorker {
  /** The worker's application context (tests look inside it; the process only waits for `stopped`). */
  readonly context: INestApplicationContext;
  /**
   * Settles when the worker has stopped after a signal. Rejects if it could not stop cleanly or
   * did not stop in time: the process should then exit with a failure code.
   */
  readonly stopped: Promise<void>;
}

/** WORKER_SHUTDOWN_TIMEOUT_MS: a positive number of milliseconds; empty means the default. */
export function shutdownTimeoutFrom(env: {
  readonly WORKER_SHUTDOWN_TIMEOUT_MS?: string | undefined;
}): number {
  const text = env.WORKER_SHUTDOWN_TIMEOUT_MS;
  if (text === undefined || text === '') return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(
      `Invalid WORKER_SHUTDOWN_TIMEOUT_MS "${text}": expected a positive whole number of milliseconds`,
    );
  return value;
}

/** The running job did not finish in time and the connections were closed at once. */
export class WorkerStopTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Worker did not stop within ${timeoutMs} ms`);
    this.name = 'WorkerStopTimeoutError';
  }
}

/**
 * Closes the context, giving a running job `timeoutMs` to finish. On timeout the connections are
 * closed at once; the unfinished job is run again by BullMQ as stalled (at least once).
 */
async function closeWithin(running: {
  readonly context: INestApplicationContext;
  readonly worker: JobWorker;
  readonly logger: Logger;
  readonly timeoutMs: number;
}): Promise<void> {
  const { context, worker, logger, timeoutMs } = running;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  const outcome = await Promise.race([
    context.close().then(() => 'closed' as const),
    timedOut,
  ]).finally(() => clearTimeout(timer));
  if (outcome === 'closed') return;
  logger.warn('Worker stop timed out', { timeoutMs });
  await worker.forceStop();
  throw new WorkerStopTimeoutError(timeoutMs);
}

/**
 * Starts the worker of an application context and stops it on SIGTERM or SIGINT: "Worker stopping",
 * the running job finishes, the queue and the Redis connections close, "Worker stopped". A second
 * signal while stopping is ignored. A job that is still running after `shutdownTimeoutMs` is left
 * to BullMQ's stalled-job handling: "Worker stop timed out", the connections close, and `stopped`
 * rejects.
 */
export function runWorker(
  context: INestApplicationContext,
  options: RunWorkerOptions = {},
): RunningWorker {
  const signals = options.signals ?? process;
  const timeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const logger = context.get<Logger>(LOGGER);
  const worker = context.get<JobWorker>(JOB_WORKER);
  worker.start(DEFAULT_INTERVAL_MS);
  logger.info('Worker started', worker.describe(DEFAULT_INTERVAL_MS));
  const stopped = new Promise<void>((resolve, reject) => {
    let stopping = false;
    const onSignal = (): void => {
      if (stopping) return;
      stopping = true;
      for (const signal of STOP_SIGNALS) signals.off(signal, onSignal);
      logger.info('Worker stopping');
      closeWithin({ context, worker, logger, timeoutMs }).then(
        () => {
          logger.info('Worker stopped');
          resolve();
        },
        (error: unknown) => {
          if (!(error instanceof WorkerStopTimeoutError))
            logger.warn('Worker could not stop cleanly', {
              error: reasonOf(error),
            });
          reject(error instanceof Error ? error : new Error(reasonOf(error)));
        },
      );
    };
    for (const signal of STOP_SIGNALS) signals.on(signal, onSignal);
  });
  return { context, stopped };
}

/**
 * The worker process (`main.worker.ts`): the worker's own root module (WorkerAppModule, no HTTP
 * server, none of the API-only modules) relays the outbox, consumes the queues and runs the sweeper
 * until it is told to stop. Until the PostgreSQL adapters (S0-11) the stores are in memory, so this
 * process does not yet share data with a separate API process.
 */
export async function startWorker(
  env: NodeJS.ProcessEnv = process.env,
  options: Pick<RunWorkerOptions, 'signals'> = {},
): Promise<RunningWorker> {
  const shutdownTimeoutMs = shutdownTimeoutFrom(env);
  // A start-up error (a missing secret) rejects, and the process exits with code 1 after the error
  // is printed; Nest's default would abort the process (SIGABRT, possibly a core dump).
  const context = await NestFactory.createApplicationContext(WorkerAppModule, {
    abortOnError: false,
  });
  return runWorker(context, { ...options, shutdownTimeoutMs });
}
