import { Module } from '@nestjs/common';
import {
  ANALYSIS_QUEUE,
  AnalysisJobHandler,
} from '../contexts/analysis/adapters/inbound/queue/analysis-job.handler.js';
import type { SweepUnanalyzedFeedback } from '../contexts/feedback/application/use-cases/sweep-unanalyzed-feedback.js';
import type { ProcessAnalysisJob } from '../contexts/analysis/application/use-cases/process-analysis-job.js';
import { MemoryOutboxStore } from '../shared-kernel/adapters/memory-outbox-store.js';
import type { Logger } from '../shared-kernel/logger.js';
import { AnalysisModule } from './analysis.module.js';
import type { InMemoryStore } from './in-memory-store.js';
import { createJobRuntime, type JobRuntime } from './job-runtime.js';
import type { PeriodicTask } from './periodic-tasks.js';
import { SweeperModule } from './sweeper.module.js';
import {
  IN_MEMORY_STORE,
  JOB_QUEUE,
  JOB_RUNTIME,
  JOB_WORKER,
  LOGGER,
  OUTBOX_RELAY,
  PROCESS_ANALYSIS_JOB,
  SWEEP_UNANALYZED,
} from './tokens.js';

const DEFAULT_INTERVAL_MS = 1_000;
const SWEEP_EVERY_MS = 60_000;

/** The sweeper as a periodic task; a feedback it could not close is logged by id, never by text. */
const sweeperTask = (
  sweep: SweepUnanalyzedFeedback,
  logger: Logger,
): PeriodicTask => ({
  name: 'sweep-unanalyzed-feedback',
  everyMs: SWEEP_EVERY_MS,
  run: async () => {
    const report = await sweep.execute();
    for (const failure of report.failures)
      logger.warn(
        'Sweeper could not close a feedback; the next sweep retries it',
        {
          feedbackId: failure.feedbackId,
          error: failure.error,
        },
      );
  },
});

/** RUN_WORKER_IN_API=true runs the worker on a timer inside the API process (single-process demo). */
const workerInApi = (env: NodeJS.ProcessEnv): boolean =>
  env['RUN_WORKER_IN_API'] === 'true';

/**
 * The asynchronous side (ADR-005, ADR-009): the job queue (QUEUE_DRIVER: in memory, or BullMQ on
 * Redis), the outbox relay, and the worker that runs analysis jobs and, once a minute, the 24-hour
 * sweeper. FeedbackSubmitted is the only event relayed (ADR-020).
 */
@Module({
  imports: [AnalysisModule, SweeperModule],
  providers: [
    {
      provide: JOB_RUNTIME,
      inject: [IN_MEMORY_STORE, PROCESS_ANALYSIS_JOB, SWEEP_UNANALYZED, LOGGER],
      useFactory: (
        ...[store, processAnalysis, sweep, logger]: [
          InMemoryStore,
          ProcessAnalysisJob,
          SweepUnanalyzedFeedback,
          Logger,
        ]
      ) =>
        createJobRuntime(process.env, {
          outbox: new MemoryOutboxStore(store.outbox),
          queues: { FeedbackSubmitted: ANALYSIS_QUEUE },
          handlers: {
            [ANALYSIS_QUEUE]: new AnalysisJobHandler(processAnalysis),
          },
          tasks: [sweeperTask(sweep, logger)],
          clock: store.clock,
          logger,
        }),
    },
    {
      provide: JOB_QUEUE,
      inject: [JOB_RUNTIME],
      useFactory: (runtime: JobRuntime) => runtime.queue,
    },
    {
      provide: OUTBOX_RELAY,
      inject: [JOB_RUNTIME],
      useFactory: (runtime: JobRuntime) => runtime.relay,
    },
    {
      provide: JOB_WORKER,
      inject: [JOB_RUNTIME],
      useFactory: (runtime: JobRuntime) => {
        const { worker } = runtime;
        return Object.assign(worker, {
          onApplicationBootstrap: () => {
            if (workerInApi(process.env)) worker.start(DEFAULT_INTERVAL_MS);
          },
          onModuleDestroy: () => worker.stop(),
        });
      },
    },
  ],
  exports: [JOB_WORKER, JOB_QUEUE],
})
export class WorkerModule {}
