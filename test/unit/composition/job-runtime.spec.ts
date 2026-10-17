import { BullMqWorker } from '../../../src/composition/bullmq-worker.js';
import { InProcessWorker } from '../../../src/composition/in-process-worker.js';
import {
  createJobRuntime,
  queueDriverOf,
  type JobRuntimeDeps,
} from '../../../src/composition/job-runtime.js';
import { BullMqJobQueue } from '../../../src/platform/queue/bullmq-job-queue.js';
import { MemoryJobQueue } from '../../../src/shared-kernel/adapters/memory-job-queue.js';
import type { OutboxStore } from '../../../src/shared-kernel/outbox-store.js';
import { FakeClock } from '../../support/fake-clock.js';
import { RecordingLogger } from '../../support/recording-logger.js';

const deps = (): JobRuntimeDeps => ({
  outbox: {} as OutboxStore,
  queues: {},
  handlers: {},
  tasks: [],
  clock: new FakeClock(),
  logger: new RecordingLogger(),
});

describe('queueDriverOf (QUEUE_DRIVER, ADR-009)', () => {
  it.each([undefined, '', 'memory'])(
    'uses the in-memory queue when QUEUE_DRIVER is %s',
    (driver) => {
      expect(queueDriverOf({ QUEUE_DRIVER: driver })).toBe('memory');
    },
  );

  it('uses BullMQ when asked to', () => {
    expect(queueDriverOf({ QUEUE_DRIVER: 'bullmq' })).toBe('bullmq');
  });

  it('refuses an unknown driver at start-up', () => {
    expect(() => queueDriverOf({ QUEUE_DRIVER: 'sqs' })).toThrow(
      'Unknown QUEUE_DRIVER "sqs"',
    );
  });
});

describe('createJobRuntime', () => {
  it('wires the in-memory queue with the tick-driven worker', () => {
    const runtime = createJobRuntime({}, deps());

    expect(runtime.queue).toBeInstanceOf(MemoryJobQueue);
    expect(runtime.worker).toBeInstanceOf(InProcessWorker);
  });

  it('wires BullMQ with its worker, without connecting before the first use', async () => {
    const runtime = createJobRuntime(
      { QUEUE_DRIVER: 'bullmq', REDIS_URL: 'redis://localhost:6399' },
      deps(),
    );

    expect(runtime.queue).toBeInstanceOf(BullMqJobQueue);
    expect(runtime.worker).toBeInstanceOf(BullMqWorker);
    await runtime.worker.stop();
  });

  it('describes the worker for the start-up log without any credential', async () => {
    const runtime = createJobRuntime(
      {
        QUEUE_DRIVER: 'bullmq',
        REDIS_URL: 'redis://worker:s3cret@cache.internal:6380/2',
      },
      {
        ...deps(),
        tasks: [
          { name: 'sweep', everyMs: 60_000, run: () => Promise.resolve() },
        ],
      },
    );

    const described = runtime.worker.describe(1_000);

    expect(described).toEqual({
      driver: 'bullmq',
      queues: [],
      redisHost: 'cache.internal',
      redisPort: 6380,
      concurrency: 1,
      tickIntervalMs: 1_000,
      tasks: [{ name: 'sweep', everyMs: 60_000 }],
    });
    expect(JSON.stringify(described)).not.toMatch(/s3cret|worker:/);
    await runtime.worker.stop();
  });
});
