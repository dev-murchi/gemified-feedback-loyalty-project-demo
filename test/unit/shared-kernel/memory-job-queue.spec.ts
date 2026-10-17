import { MemoryJobQueue } from '../../../src/shared-kernel/adapters/memory-job-queue.js';
import {
  failureDelayMs,
  JOB_FAILURE_BACKOFF,
} from '../../../src/shared-kernel/job-failure-backoff.js';
import type {
  JobHandler,
  JobResult,
} from '../../../src/shared-kernel/job-handler.js';

const T0 = new Date('2026-10-17T09:00:00.000Z');
const later = (ms: number) => new Date(T0.getTime() + ms);
const MINUTE = 60_000;

/** A handler that answers from a script and counts its calls. */
const scripted = (
  ...answers: (JobResult | Error)[]
): JobHandler & { calls: number } => {
  const handler = {
    calls: 0,
    handle: () => {
      const answer = answers[Math.min(handler.calls, answers.length - 1)];
      handler.calls += 1;
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer ?? { outcome: 'done' as const });
    },
  };
  return handler;
};

describe('MemoryJobQueue: running jobs', () => {
  let queue: MemoryJobQueue;

  beforeEach(async () => {
    queue = new MemoryJobQueue();
    await queue.enqueue({ queue: 'analysis', id: 'job-1', payload: { n: 1 } });
  });

  it('runs a due job once and marks it done; a done job never runs again', async () => {
    const handler = scripted({ outcome: 'done' });

    expect(await queue.runDue('analysis', handler, T0)).toMatchObject({
      done: 1,
      retried: 0,
    });
    await queue.runDue('analysis', handler, later(MINUTE));

    expect(handler.calls).toBe(1);
    expect(queue.statesOf('analysis')[0]?.status).toBe('done');
  });

  it('does not run a job before its time', async () => {
    await queue.enqueue({
      queue: 'analysis',
      id: 'job-2',
      payload: {},
      runAt: later(MINUTE),
    });
    const handler = scripted({ outcome: 'done' });

    await queue.runDue('analysis', handler, T0);

    expect(handler.calls).toBe(1);
    expect(queue.statesOf('analysis')[1]?.status).toBe('waiting');
  });

  it('moves a job to the time of a planned retry, without counting a failure', async () => {
    const handler = scripted(
      { outcome: 'retry', at: later(5 * MINUTE) },
      { outcome: 'done' },
    );

    await queue.runDue('analysis', handler, T0);
    await queue.runDue('analysis', handler, later(4 * MINUTE));
    expect(handler.calls).toBe(1);
    await queue.runDue('analysis', handler, later(5 * MINUTE));

    expect(handler.calls).toBe(2);
    expect(queue.statesOf('analysis')[0]).toMatchObject({
      status: 'done',
      failures: 0,
    });
  });

  it('backs a throwing job off, 1 minute doubling, and keeps the error name and message', async () => {
    const handler = scripted(new Error('store unavailable'));

    await queue.runDue('analysis', handler, T0);

    expect(queue.statesOf('analysis')[0]).toMatchObject({
      status: 'waiting',
      failures: 1,
      runAt: later(MINUTE),
      lastError: 'Error: store unavailable',
    });
    await queue.runDue('analysis', handler, later(30_000));
    expect(handler.calls).toBe(1);
  });

  it('gives a job up after its last attempt and never runs it again: no hot loop', async () => {
    const handler = scripted(new Error('always fails'));
    let now = T0;
    for (
      let attempt = 1;
      attempt <= JOB_FAILURE_BACKOFF.maxAttempts;
      attempt += 1
    ) {
      const report = await queue.runDue('analysis', handler, now);
      now = later(now.getTime() - T0.getTime() + failureDelayMs(attempt));
      if (attempt === JOB_FAILURE_BACKOFF.maxAttempts)
        expect(report.failedForGood).toHaveLength(1);
    }

    await queue.runDue('analysis', handler, later(24 * 60 * MINUTE));

    expect(handler.calls).toBe(JOB_FAILURE_BACKOFF.maxAttempts);
    expect(queue.statesOf('analysis')[0]?.status).toBe('failed');
  });

  it('keeps other jobs running when one throws', async () => {
    await queue.enqueue({ queue: 'analysis', id: 'job-2', payload: { n: 2 } });
    const handler: JobHandler = {
      handle: (payload) =>
        (payload as { n: number }).n === 1
          ? Promise.reject(new Error('bad'))
          : Promise.resolve({ outcome: 'done' }),
    };

    const report = await queue.runDue('analysis', handler, T0);

    expect(report).toMatchObject({ done: 1, retried: 1 });
  });
});

describe('failureDelayMs (JOB_FAILURE_BACKOFF)', () => {
  it('waits 1, 2, 4, 8 minutes and at most 30', () => {
    expect([1, 2, 3, 4, 6, 20].map(failureDelayMs)).toEqual([
      MINUTE,
      2 * MINUTE,
      4 * MINUTE,
      8 * MINUTE,
      30 * MINUTE,
      30 * MINUTE,
    ]);
  });
});
