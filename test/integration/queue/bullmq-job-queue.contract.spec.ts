// The JobQueue contract (ADR-009) against BullMQ on a real Redis (Testcontainers); the in-memory
// queue runs the same cases in test/contract/shared-kernel.

import type { StartedRedisContainer } from '@testcontainers/redis';
import { BullMqJobQueue } from '../../../src/platform/queue/bullmq-job-queue.js';
import { SystemClock } from '../../../src/shared-kernel/adapters/system-clock.js';
import { jobQueueContract } from '../../contract/support/job-queue.contract.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import {
  connectionOf,
  freshPrefix,
  startRedis,
} from '../../support/redis-container.js';

describe('JobQueue (BullMQ on Redis)', () => {
  let redis: StartedRedisContainer;

  beforeAll(async () => {
    redis = await startRedis();
  });

  afterAll(() => redis.stop());

  jobQueueContract(() => {
    const queue = new BullMqJobQueue({
      connection: connectionOf(redis),
      clock: new SystemClock(),
      logger: new RecordingLogger(),
      prefix: freshPrefix(),
    });
    return Promise.resolve({
      queue,
      jobsOf: (name) => queue.jobsOf(name),
      dispose: () => queue.close(),
    });
  });
});
