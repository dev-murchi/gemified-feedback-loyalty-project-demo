// What the BullMQ adapter does with a job once a handler consumes it: planned retries, failure
// backoff and giving up. The failure delay is shortened to 20 ms; the real policy is
// JOB_FAILURE_BACKOFF. Nothing here sleeps: a test waits until the queue is settled (no job
// waiting, delayed or active) and only then looks at what ran.

import type { StartedRedisContainer } from '@testcontainers/redis';
import { Queue } from 'bullmq';
import { BullMqJobQueue } from '../../../src/platform/queue/bullmq-job-queue.js';
import { SystemClock } from '../../../src/shared-kernel/adapters/system-clock.js';
import { JOB_FAILURE_BACKOFF } from '../../../src/shared-kernel/job-failure-backoff.js';
import type {
  JobHandler,
  JobResult,
} from '../../../src/shared-kernel/job-handler.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import {
  connectionOf,
  freshPrefix,
  startRedis,
} from '../../support/redis-container.js';
import { waitFor } from '../../support/wait-for.js';

const DONE: JobResult = { outcome: 'done' };

/** A handler whose n-th call (from 1) does what `script` says; it records the payloads it saw. */
function scripted(script: (call: number) => JobResult | Error): {
  readonly handler: JobHandler;
  readonly payloads: unknown[];
} {
  const payloads: unknown[] = [];
  const handler: JobHandler = {
    handle: (payload) => {
      payloads.push(payload);
      const step = script(payloads.length);
      return step instanceof Error
        ? Promise.reject(step)
        : Promise.resolve(step);
    },
  };
  return { handler, payloads };
}

describe('BullMqJobQueue consuming a queue (Redis)', () => {
  let redis: StartedRedisContainer;
  let queue: BullMqJobQueue;
  let counts: Queue;
  let logger: RecordingLogger;

  beforeAll(async () => {
    redis = await startRedis();
  });

  afterAll(() => redis.stop());

  beforeEach(() => {
    logger = new RecordingLogger();
    const prefix = freshPrefix();
    queue = new BullMqJobQueue({
      connection: connectionOf(redis),
      clock: new SystemClock(),
      logger,
      prefix,
      failureDelayMs: () => 20,
    });
    counts = new Queue('analysis', { connection: connectionOf(redis), prefix });
  });

  afterEach(async () => {
    await queue.close();
    await counts.close();
  });

  /** Looks at Redis, not at the clock: true once no job is waiting, delayed or running. */
  const settled = async (): Promise<boolean> => {
    const open = await counts.getJobCounts('waiting', 'delayed', 'active');
    return Object.values(open).every((count) => count === 0);
  };

  const settle = (): Promise<void> => waitFor(settled, 'the queue to settle');

  it('hands the handler the payload as JSON (a Date arrives as text)', async () => {
    const { handler, payloads } = scripted(() => DONE);
    const at = new Date('2026-10-16T09:00:00.000Z');
    queue.consume('analysis', handler);

    await queue.enqueue({
      queue: 'analysis',
      id: 'job-1',
      payload: { n: 1, at },
    });

    await waitFor(() => payloads.length === 1, 'the job to run');
    expect(payloads).toEqual([{ n: 1, at: at.toISOString() }]);
  });

  it('does not run a job before its run time', async () => {
    const ranAt: number[] = [];
    queue.consume('analysis', {
      handle: () => {
        ranAt.push(Date.now());
        return Promise.resolve(DONE);
      },
    });
    const runAt = new Date(Date.now() + 500);

    await queue.enqueue({
      queue: 'analysis',
      id: 'job-1',
      payload: {},
      runAt,
    });

    await waitFor(() => ranAt.length === 1, 'the job to run at its time');
    expect(ranAt[0]).toBeGreaterThanOrEqual(runAt.getTime());
  });

  it('runs a job again at the time of a planned retry, and a planned retry uses no attempt', async () => {
    const runs = JOB_FAILURE_BACKOFF.maxAttempts + 1;
    const { handler, payloads } = scripted((call) =>
      call <= runs ? { outcome: 'retry', at: new Date(Date.now() + 20) } : DONE,
    );
    queue.consume('analysis', handler);

    await queue.enqueue({ queue: 'analysis', id: 'job-1', payload: {} });

    await waitFor(() => payloads.length === runs + 1, 'the last rerun');
    await settle();
    expect(payloads).toHaveLength(runs + 1);
    expect((await counts.getJobCounts('completed')).completed).toBe(1);
    expect(logger.warnings).toEqual([]);
  });

  it('retries a job whose handler threw, until it succeeds', async () => {
    const { handler, payloads } = scripted((call) =>
      call <= 2 ? new Error('provider down') : DONE,
    );
    queue.consume('analysis', handler);

    await queue.enqueue({ queue: 'analysis', id: 'job-1', payload: {} });

    await waitFor(() => payloads.length === 3, 'the third attempt');
    await settle();
    expect(payloads).toHaveLength(3);
    expect((await counts.getJobCounts('completed')).completed).toBe(1);
    expect(logger.warnings).toEqual([]);
  });

  it('gives up after the last attempt, logs the job id but not the payload, and never runs it again', async () => {
    const { handler, payloads } = scripted(() => new Error('boom'));
    queue.consume('analysis', handler);

    await queue.enqueue({
      queue: 'analysis',
      id: 'job-1',
      payload: { secret: 'PAYLOAD-TEXT' },
    });

    await waitFor(() => logger.warnings.length === 1, 'the failure warning');
    await settle();
    expect(payloads).toHaveLength(JOB_FAILURE_BACKOFF.maxAttempts);
    expect((await counts.getJobCounts('failed')).failed).toBe(1);
    expect(logger.warnings).toEqual([
      {
        message: 'Job failed for good after its last attempt',
        fields: {
          queue: 'analysis',
          jobId: 'job-1',
          attempts: JOB_FAILURE_BACKOFF.maxAttempts,
          error: 'Error: boom',
        },
      },
    ]);
    expect(JSON.stringify(logger.warnings)).not.toContain('PAYLOAD-TEXT');
    expect(await queue.jobsOf('analysis')).toHaveLength(1);
  });

  it('lets a running job finish before it closes, and does not run that job again', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    let started = 0;
    queue.consume('analysis', {
      handle: async () => {
        started += 1;
        await gate;
        order.push('job finished');
        return DONE;
      },
    });
    await queue.enqueue({ queue: 'analysis', id: 'job-1', payload: {} });
    await waitFor(() => started === 1, 'the job to start');

    const closing = queue.close().then(() => order.push('closed'));
    // A round trip to Redis while the close is under way: the job is still running.
    expect((await counts.getJobCounts('active')).active).toBe(1);
    release();
    await closing;

    expect(order).toEqual(['job finished', 'closed']);
    expect(started).toBe(1);
    expect((await counts.getJobCounts('completed')).completed).toBe(1);
    expect(logger.warnings).toEqual([]);
  });

  it('does not run a finished job again when the relay hands it over a second time', async () => {
    const { handler, payloads } = scripted(() => DONE);
    queue.consume('analysis', handler);
    await queue.enqueue({ queue: 'analysis', id: 'job-1', payload: {} });
    await waitFor(() => payloads.length === 1, 'the job to run');
    await settle();

    await queue.enqueue({ queue: 'analysis', id: 'job-1', payload: {} });

    // Accepted again, the job would be waiting now and run before the queue settles.
    await settle();
    expect(payloads).toHaveLength(1);
  });
});
