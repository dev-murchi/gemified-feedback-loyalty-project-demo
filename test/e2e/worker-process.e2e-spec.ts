// `main.worker.ts` through runWorker: the worker process starts without an HTTP server, logs what
// it is, consumes the analysis queue from a real Redis (Testcontainers) and stops on a signal. The
// job is for a feedback this process does not know, which the analysis skips as done; the stores
// are in memory until S0-11, so a worker process cannot yet share feedback with an API process.
// Nothing sleeps: tests wait for the log line, the job count or the settled promise they need.

import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { StartedRedisContainer } from '@testcontainers/redis';
import { AppModule } from '../../src/composition/app.module.js';
import {
  runWorker,
  WorkerStopTimeoutError,
  type RunningWorker,
} from '../../src/composition/start-worker.js';
import { LOGGER, PROCESS_ANALYSIS_JOB } from '../../src/composition/tokens.js';
import type { ProcessAnalysisJob } from '../../src/contexts/analysis/application/use-cases/process-analysis-job.js';
import { BullMqJobQueue } from '../../src/platform/queue/bullmq-job-queue.js';
import { redisConnectionFrom } from '../../src/platform/queue/redis-connection.js';
import { SystemClock } from '../../src/shared-kernel/adapters/system-clock.js';
import { RecordingLogger } from '../support/recording-logger.js';
import { startRedis } from '../support/redis-container.js';
import { waitFor } from '../support/wait-for.js';

describe('the worker process (main.worker.ts)', () => {
  let redis: StartedRedisContainer;
  let logger: RecordingLogger;
  let signals: EventEmitter;
  let running: RunningWorker;
  let producer: BullMqJobQueue;
  let counts: Queue;

  beforeAll(async () => {
    redis = await startRedis();
  });

  afterAll(() => redis.stop());

  /** Starts the worker of the whole application, optionally with its analysis job replaced. */
  const boot = async (
    options: {
      readonly processAnalysis?: Pick<ProcessAnalysisJob, 'execute'>;
      readonly shutdownTimeoutMs?: number;
    } = {},
  ): Promise<void> => {
    let builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LOGGER)
      .useValue(logger);
    if (options.processAnalysis !== undefined)
      builder = builder
        .overrideProvider(PROCESS_ANALYSIS_JOB)
        .useValue(options.processAnalysis);
    const module = await builder.compile();
    await module.init();
    running = runWorker(module, {
      signals,
      ...(options.shutdownTimeoutMs === undefined
        ? {}
        : { shutdownTimeoutMs: options.shutdownTimeoutMs }),
    });
  };

  beforeEach(async () => {
    await redis.executeCliCmd('flushall');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('QUEUE_DRIVER', 'bullmq');
    vi.stubEnv('REDIS_URL', redis.getConnectionUrl());
    logger = new RecordingLogger();
    signals = new EventEmitter();
    const connection = redisConnectionFrom(redis.getConnectionUrl());
    producer = new BullMqJobQueue({
      connection,
      clock: new SystemClock(),
      logger: new RecordingLogger(),
    });
    counts = new Queue('analysis', { connection });
  });

  afterEach(async () => {
    if (signals.listenerCount('SIGTERM') > 0) {
      signals.emit('SIGTERM');
      await running.stopped;
    }
    await counts.close();
    await producer.close();
    vi.unstubAllEnvs();
  });

  /** Redis's own count of open client connections (ours, BullMQ's and the CLI call's). */
  const connectedClients = async (): Promise<number> => {
    const info = await redis.executeCliCmd('info', ['clients']);
    return Number(/connected_clients:(\d+)/.exec(info)?.[1]);
  };

  const messages = (): string[] => logger.infos.map((entry) => entry.message);

  // The other modules log their own start-up warnings (generated demo keys); only the worker's and
  // Redis's lines are under test here.
  const ownWarnings = () =>
    logger.warnings.filter((entry) => /^(Worker|Redis)/.test(entry.message));

  const submittedJob = () => ({
    queue: 'analysis',
    id: randomUUID(),
    payload: {
      type: 'FeedbackSubmitted',
      aggregateId: randomUUID(),
      sector: 'fuel',
      submittedAt: new Date(),
    },
  });

  it('logs what it is on start: driver, queue, Redis host and port, concurrency, tasks', async () => {
    await boot();
    await waitFor(() => messages().includes('Redis connected'), 'Redis');

    expect(logger.infos[0]).toEqual({
      message: 'Worker started',
      fields: {
        driver: 'bullmq',
        queues: ['analysis'],
        redisHost: redis.getHost(),
        redisPort: redis.getPort(),
        concurrency: 1,
        tickIntervalMs: 1_000,
        tasks: [{ name: 'sweep-unanalyzed-feedback', everyMs: 60_000 }],
      },
    });
    expect(
      logger.infos.find((entry) => entry.message === 'Redis connected'),
    ).toEqual({
      message: 'Redis connected',
      fields: { redisHost: redis.getHost(), redisPort: redis.getPort() },
    });
    expect(ownWarnings()).toEqual([]);
  });

  it('consumes the analysis queue from Redis', async () => {
    await boot();

    await producer.enqueue(submittedJob());

    await waitFor(
      async () => (await counts.getJobCounts('completed')).completed === 1,
      'the worker to finish the job',
    );
  });

  it('stops gracefully on SIGTERM: logs, closes Redis without calling it a loss, ignores a second signal', async () => {
    await boot();
    await waitFor(() => messages().includes('Redis connected'), 'Redis');

    signals.emit('SIGTERM');
    signals.emit('SIGINT');
    await running.stopped;

    expect(messages()).toEqual([
      'Worker started',
      'Redis connected',
      'Worker stopping',
      'Worker stopped',
    ]);
    expect(ownWarnings()).toEqual([]);
    expect(signals.listenerCount('SIGTERM')).toBe(0);
    expect(signals.listenerCount('SIGINT')).toBe(0);
  });

  it('never puts a payload, comment text or user id in a log field', async () => {
    await boot();
    await waitFor(() => messages().includes('Redis connected'), 'Redis');

    signals.emit('SIGINT');
    await running.stopped;

    const logged = JSON.stringify([...logger.infos, ...ownWarnings()]);
    expect(logged).not.toMatch(/password|payload|text|userId|redis:\/\//i);
  });

  it('stops waiting for a job that never finishes: warns, closes the connections and fails', async () => {
    let started = false;
    await producer.enqueue(submittedJob());
    await counts.getJobCounts('active'); // both test connections are open now
    const before = await connectedClients();
    await boot({
      shutdownTimeoutMs: 200,
      processAnalysis: {
        execute: () => {
          started = true;
          return new Promise(() => undefined);
        },
      },
    });
    await waitFor(() => started, 'the job to start');
    expect(await connectedClients()).toBeGreaterThan(before);

    signals.emit('SIGTERM');

    await expect(running.stopped).rejects.toBeInstanceOf(
      WorkerStopTimeoutError,
    );
    expect(messages()).toEqual([
      'Worker started',
      'Redis connected',
      'Worker stopping',
    ]);
    expect(ownWarnings()).toEqual([
      { message: 'Worker stop timed out', fields: { timeoutMs: 200 } },
    ]);
    await waitFor(
      async () => (await connectedClients()) === before,
      "the worker's connections to close",
    );
    // The job is left running in Redis: its lock expires and BullMQ runs it again as stalled.
    expect(await counts.getJobCounts('active', 'completed', 'failed')).toEqual({
      active: 1,
      completed: 0,
      failed: 0,
    });
  });
});
