import { Module } from '@nestjs/common';
import {
  ANALYSIS_QUEUE,
  AnalysisJobHandler,
} from '../contexts/analysis/adapters/inbound/queue/analysis-job.handler.js';
import type { ProcessAnalysisJob } from '../contexts/analysis/application/use-cases/process-analysis-job.js';
import { MemoryJobQueue } from '../shared-kernel/adapters/memory-job-queue.js';
import { MemoryOutboxStore } from '../shared-kernel/adapters/memory-outbox-store.js';
import type { Logger } from '../shared-kernel/logger.js';
import { OutboxRelay } from '../shared-kernel/outbox-relay.js';
import { AnalysisModule } from './analysis.module.js';
import type { InMemoryStore } from './in-memory-store.js';
import { InProcessWorker } from './in-process-worker.js';
import {
  IN_MEMORY_STORE,
  IN_PROCESS_WORKER,
  JOB_QUEUE,
  LOGGER,
  OUTBOX_RELAY,
  PROCESS_ANALYSIS_JOB,
} from './tokens.js';

const DEFAULT_INTERVAL_MS = 1_000;

/** RUN_WORKER_IN_API=true runs the worker on a timer inside the API process (single-process demo). */
const workerInApi = (env: NodeJS.ProcessEnv): boolean =>
  env['RUN_WORKER_IN_API'] === 'true';

/**
 * The asynchronous side (ADR-005, ADR-009): the in-memory job queue, the outbox relay, and the
 * worker that runs analysis jobs. FeedbackSubmitted is the only event relayed (ADR-020).
 */
@Module({
  imports: [AnalysisModule],
  providers: [
    { provide: JOB_QUEUE, useFactory: () => new MemoryJobQueue() },
    {
      provide: OUTBOX_RELAY,
      inject: [IN_MEMORY_STORE, JOB_QUEUE],
      useFactory: (store: InMemoryStore, queue: MemoryJobQueue) =>
        new OutboxRelay({
          outbox: new MemoryOutboxStore(store.outbox),
          queue,
          queues: { FeedbackSubmitted: ANALYSIS_QUEUE },
          clock: store.clock,
        }),
    },
    {
      provide: IN_PROCESS_WORKER,
      inject: [
        OUTBOX_RELAY,
        JOB_QUEUE,
        PROCESS_ANALYSIS_JOB,
        IN_MEMORY_STORE,
        LOGGER,
      ],
      useFactory: (
        ...[relay, queue, processAnalysis, store, logger]: [
          OutboxRelay,
          MemoryJobQueue,
          ProcessAnalysisJob,
          InMemoryStore,
          Logger,
        ]
      ) => {
        const worker = new InProcessWorker({
          relay,
          queue,
          handlers: {
            [ANALYSIS_QUEUE]: new AnalysisJobHandler(processAnalysis),
          },
          clock: store.clock,
          logger,
        });
        return Object.assign(worker, {
          onApplicationBootstrap: () => {
            if (workerInApi(process.env)) worker.start(DEFAULT_INTERVAL_MS);
          },
          onModuleDestroy: () => worker.stop(),
        });
      },
    },
  ],
  exports: [IN_PROCESS_WORKER, JOB_QUEUE],
})
export class WorkerModule {}
