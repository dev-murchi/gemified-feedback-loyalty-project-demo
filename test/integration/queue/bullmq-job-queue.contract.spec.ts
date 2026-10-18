// The JobQueue contract (ADR-009) against BullMQ on a real Redis (Testcontainers); the in-memory
// queue runs the same cases in test/contract/shared-kernel.

import { BullMqJobQueue } from '../../../src/platform/queue/bullmq-job-queue.js';
import { SystemClock } from '../../../src/shared-kernel/adapters/system-clock.js';
import { jobQueueContract } from '../../contract/support/job-queue.contract.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import {
  freshPrefix,
  freshRedis,
  type TestRedis,
} from '../../support/redis.js';

describe('JobQueue (BullMQ on Redis)', () => {
  let redis: TestRedis;

  beforeAll(async () => {
    redis = await freshRedis();
  });

  afterAll(() => redis.release());

  jobQueueContract(() => {
    const queue = new BullMqJobQueue({
      connection: redis.connection,
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
