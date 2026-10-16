// The JobQueue contract (ADR-009): the same cases run against the in-memory queue and, from slice
// 4, against BullMQ on a real Redis.

import type {
  JobQueue,
  QueuedJob,
} from '../../../src/shared-kernel/job-queue.js';

export interface JobQueueHarness {
  readonly queue: JobQueue;
  /** The jobs a queue holds, in the order they were first accepted. */
  jobsOf(queue: string): Promise<readonly QueuedJob[]>;
  dispose(): Promise<void>;
}

export function jobQueueContract(
  makeHarness: () => Promise<JobQueueHarness>,
): void {
  let harness: JobQueueHarness;

  beforeEach(async () => {
    harness = await makeHarness();
  });

  afterEach(() => harness.dispose());

  it('keeps an accepted job with its payload and run time', async () => {
    const runAt = new Date('2026-10-16T09:01:00.000Z');

    await harness.queue.enqueue({
      queue: 'analysis',
      id: 'job-1',
      payload: { n: 1 },
      runAt,
    });

    expect(await harness.jobsOf('analysis')).toEqual([
      { queue: 'analysis', id: 'job-1', payload: { n: 1 }, runAt },
    ]);
  });

  it('accepts a job id once: handing it over again changes nothing (the relay may, after a crash)', async () => {
    await harness.queue.enqueue({
      queue: 'analysis',
      id: 'job-1',
      payload: { n: 1 },
    });

    await harness.queue.enqueue({
      queue: 'analysis',
      id: 'job-1',
      payload: { n: 2 },
    });

    expect(await harness.jobsOf('analysis')).toEqual([
      { queue: 'analysis', id: 'job-1', payload: { n: 1 } },
    ]);
  });

  it('keeps queues apart', async () => {
    await harness.queue.enqueue({
      queue: 'analysis',
      id: 'job-1',
      payload: {},
    });
    await harness.queue.enqueue({ queue: 'other', id: 'job-1', payload: {} });

    expect(await harness.jobsOf('analysis')).toHaveLength(1);
    expect(await harness.jobsOf('other')).toHaveLength(1);
  });
}
