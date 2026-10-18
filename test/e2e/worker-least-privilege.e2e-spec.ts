// The worker process through its real entry point (startWorker, the body of main.worker.ts): it
// loads only what its work uses, so in production it needs none of the API's secrets or Redis
// connections (least privilege, NFR-SEC-06). It still needs what it uses: the raw-text key, the LLM
// settings, the queue driver and Redis. Redis is real (Testcontainers); the LLM provider is a local
// fake. Nothing sleeps: tests wait for the job count or the call they need.

import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { StartedRedisContainer } from '@testcontainers/redis';
import {
  startWorker,
  type RunningWorker,
} from '../../src/composition/start-worker.js';
import {
  ACCESS_TOKENS,
  AUTHENTICATE_REQUEST,
  B2B_ACCESS_TOKENS,
  CHALLENGE_STORE,
  RATE_LIMIT_CONFIG,
  RATE_LIMITER,
  SIGNING_KEY,
  SWEEP_UNANALYZED,
  USER_REPOSITORY,
} from '../../src/composition/tokens.js';
import type { SweepUnanalyzedFeedback } from '../../src/contexts/feedback/application/use-cases/sweep-unanalyzed-feedback.js';
import { RATE_LIMIT_ENFORCER } from '../../src/platform/http/rate-limit.enforcer.js';
import { BullMqJobQueue } from '../../src/platform/queue/bullmq-job-queue.js';
import { redisConnectionFrom } from '../../src/platform/queue/redis-connection.js';
import { SystemClock } from '../../src/shared-kernel/adapters/system-clock.js';
import {
  startFakeOpenAi,
  type FakeOpenAiServer,
} from '../support/fake-openai-server.js';
import { RecordingLogger } from '../support/recording-logger.js';
import { startRedis } from '../support/redis-container.js';
import { waitFor } from '../support/wait-for.js';

describe('the worker process in production, with only its own secrets (NFR-SEC-06)', () => {
  let redis: StartedRedisContainer;
  let provider: FakeOpenAiServer;
  let signals: EventEmitter;
  let running: RunningWorker | undefined;
  let producer: BullMqJobQueue;
  let counts: Queue;
  let lines: string[];

  beforeAll(async () => {
    redis = await startRedis();
    provider = await startFakeOpenAi();
  });

  afterAll(async () => {
    await provider.close();
    await redis.stop();
  });

  /** What the worker needs and nothing else; every API-only setting is empty. */
  const stubWorkerEnvironment = (): void => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('QUEUE_DRIVER', 'bullmq');
    vi.stubEnv('REDIS_URL', redis.getConnectionUrl());
    vi.stubEnv('RAW_TEXT_KEY', randomBytes(32).toString('base64'));
    vi.stubEnv('RAW_TEXT_KEY_ID', 'prod-1');
    vi.stubEnv('LLM_DRIVER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('OPENAI_MODEL', 'gpt-test');
    vi.stubEnv('OPENAI_BASE_URL', provider.baseUrl);
    for (const apiOnly of [
      'JWT_PRIVATE_KEY',
      'JWT_KEY_ID',
      'B2B_JWT_PRIVATE_KEY',
      'B2B_JWT_KEY_ID',
      'RATE_LIMIT_DRIVER',
      'CHALLENGE_STORE_DRIVER',
      'DEMO_DATA',
      'B2B_DEMO_CLIENTS',
    ])
      vi.stubEnv(apiOnly, '');
  };

  beforeEach(async () => {
    await redis.executeCliCmd('flushall');
    stubWorkerEnvironment();
    signals = new EventEmitter();
    running = undefined;
    lines = [];
    // The worker's own logger writes JSON lines to the console; keep them and keep the output quiet.
    const keep = (line: unknown): void => {
      lines.push(String(line));
    };
    vi.spyOn(console, 'info').mockImplementation(keep);
    vi.spyOn(console, 'warn').mockImplementation(keep);
    // Nest's own start-up lines (and the stack of an expected start-up failure) are not under test.
    Logger.overrideLogger(false);
    const connection = redisConnectionFrom(redis.getConnectionUrl());
    producer = new BullMqJobQueue({
      connection,
      clock: new SystemClock(),
      logger: new RecordingLogger(),
    });
    counts = new Queue('analysis', { connection });
  });

  afterEach(async () => {
    if (running !== undefined && signals.listenerCount('SIGTERM') > 0) {
      signals.emit('SIGTERM');
      await running.stopped;
    }
    await counts.close();
    await producer.close();
    Logger.overrideLogger(['log', 'warn', 'error']);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

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

  it('boots without any API-only secret, consumes a job from Redis and runs the sweeper', async () => {
    // Given a production environment with only the worker's settings
    // When the worker starts through its real entry point
    running = await startWorker(process.env, { signals });
    const sweeper = running.context.get<SweepUnanalyzedFeedback>(
      SWEEP_UNANALYZED,
      { strict: false },
    );
    const sweeps = vi.spyOn(sweeper, 'execute');

    // And a job is waiting in Redis
    await producer.enqueue(submittedJob());

    // Then the worker consumes it, and its timer runs the 24-hour sweeper
    await waitFor(
      async () => (await counts.getJobCounts('completed')).completed === 1,
      'the worker to finish the job',
    );
    await waitFor(() => sweeps.mock.calls.length > 0, 'the sweeper to run');
    expect(lines.join('\n')).toContain('"message":"Worker started"');
    expect(lines.join('\n')).toContain('"message":"Redis connected"');
  });

  it('loads none of the API-only parts: no signing key, no rate limiter, no challenge store, no users', async () => {
    running = await startWorker(process.env, { signals });
    const context = running.context;

    for (const token of [
      SIGNING_KEY,
      ACCESS_TOKENS,
      B2B_ACCESS_TOKENS,
      AUTHENTICATE_REQUEST,
      USER_REPOSITORY,
      RATE_LIMIT_CONFIG,
      RATE_LIMITER,
      RATE_LIMIT_ENFORCER,
      CHALLENGE_STORE,
    ])
      expect(() => {
        context.get<unknown>(token, { strict: false });
      }).toThrow();
  });

  it('still needs what its work uses: the raw-text key', async () => {
    vi.stubEnv('RAW_TEXT_KEY', '');

    await expect(startWorker(process.env, { signals })).rejects.toThrow(
      /RAW_TEXT_KEY/,
    );
  });

  it('still needs what its work uses: a real LLM provider in production', async () => {
    vi.stubEnv('LLM_DRIVER', '');

    await expect(startWorker(process.env, { signals })).rejects.toThrow(
      /DemoSentimentAnalyzer must not be used with NODE_ENV=production/,
    );
  });
});
