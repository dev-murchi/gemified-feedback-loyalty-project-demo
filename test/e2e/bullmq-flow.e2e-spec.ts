// S0-10 slice 4 through the real application with QUEUE_DRIVER=bullmq on a real Redis
// (Testcontainers): a feedback sent over HTTP goes to the outbox, the relay hands it to BullMQ, the
// worker consumes it from Redis, and the reward is given. The worker runs on its timer inside the
// API process (RUN_WORKER_IN_API), so the API and the worker share one in-memory store until S0-11.

import type { StartedRedisContainer } from '@testcontainers/redis';
import { startFeedbackApp, type FeedbackApp } from '../support/feedback-app.js';
import { startRedis } from '../support/redis-container.js';
import { waitFor } from '../support/wait-for.js';

describe('outbox → relay → BullMQ → worker → reward (e2e, real Redis)', () => {
  let redis: StartedRedisContainer;
  let feedback: FeedbackApp;

  beforeAll(async () => {
    redis = await startRedis();
  });

  afterAll(() => redis.stop());

  beforeEach(async () => {
    vi.stubEnv('QUEUE_DRIVER', 'bullmq');
    vi.stubEnv('REDIS_URL', redis.getConnectionUrl());
    vi.stubEnv('RUN_WORKER_IN_API', 'true');
    // The test polls every 20 ms against a clock that stands still; the rate limit is not under test.
    vi.stubEnv('RATE_LIMIT_DEVICE_PER_MINUTE', '600000');
    vi.stubEnv('RATE_LIMIT_DEVICE_BURST', '100000');
    feedback = await startFeedbackApp();
  });

  afterEach(async () => {
    await feedback.running.app.close();
    vi.unstubAllEnvs();
  });

  it('analyzes and rewards a submitted feedback consumed from Redis (US-04, FR-GAM-01)', async () => {
    const response = await feedback.client.submit();
    expect(response.status).toBe(202);
    const { feedbackId } = response.body as { feedbackId: string };

    await waitFor(
      async () =>
        (
          (await feedback.client.status(feedbackId)).body as {
            status: string;
          }
        ).status === 'valid',
      'the feedback to be analyzed',
    );

    expect((await feedback.client.status(feedbackId)).body).toMatchObject({
      status: 'valid',
      reward: { xp: 10, points: 5 },
    });
    expect(
      (await feedback.auth.wallet(feedback.client.token)).body,
    ).toMatchObject({ xp: 10 });
  });
});
