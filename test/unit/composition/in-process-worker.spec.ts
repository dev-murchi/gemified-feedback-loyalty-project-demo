import { InProcessWorker } from '../../../src/composition/in-process-worker.js';
import { MemoryJobQueue } from '../../../src/shared-kernel/adapters/memory-job-queue.js';
import { JOB_FAILURE_BACKOFF } from '../../../src/shared-kernel/job-failure-backoff.js';
import type { OutboxRelay } from '../../../src/shared-kernel/outbox-relay.js';
import { FakeClock } from '../../support/fake-clock.js';
import { RecordingLogger } from '../../support/recording-logger.js';

describe('InProcessWorker', () => {
  let relays: number;
  const relay = {
    relay: () => {
      relays += 1;
      return Promise.resolve({ published: 0, failed: 0 });
    },
  } as unknown as OutboxRelay;

  beforeEach(() => {
    relays = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('relays the outbox, then runs due jobs, on each tick', async () => {
    const queue = new MemoryJobQueue();
    await queue.enqueue({ queue: 'analysis', id: 'job-1', payload: {} });
    const handled: unknown[] = [];
    const worker = new InProcessWorker({
      relay,
      queue,
      handlers: {
        analysis: {
          handle: (p) => (
            handled.push(p),
            Promise.resolve({ outcome: 'done' })
          ),
        },
      },
      clock: new FakeClock(),
      logger: new RecordingLogger(),
    });

    await worker.tick();

    expect(relays).toBe(1);
    expect(handled).toEqual([{}]);
  });

  it('logs a job given up after its last attempt, with its id but no payload', async () => {
    const queue = new MemoryJobQueue();
    await queue.enqueue({
      queue: 'analysis',
      id: 'job-1',
      payload: { secret: 'PAYLOAD' },
    });
    const clock = new FakeClock();
    const logger = new RecordingLogger();
    const worker = new InProcessWorker({
      relay,
      queue,
      handlers: {
        analysis: { handle: () => Promise.reject(new Error('broken')) },
      },
      clock,
      logger,
    });

    for (
      let attempt = 0;
      attempt < JOB_FAILURE_BACKOFF.maxAttempts;
      attempt += 1
    ) {
      await worker.tick();
      clock.advance(JOB_FAILURE_BACKOFF.maxDelayMs);
    }

    expect(logger.warnings).toEqual([
      {
        message: 'Job failed for good after its last attempt',
        fields: {
          queue: 'analysis',
          jobId: 'job-1',
          attempts: 5,
          error: 'Error: broken',
        },
      },
    ]);
    expect(JSON.stringify(logger.warnings)).not.toContain('PAYLOAD');
  });

  it('ticks on a timer once started, and stops cleanly', async () => {
    vi.useFakeTimers();
    const worker = new InProcessWorker({
      relay,
      queue: new MemoryJobQueue(),
      handlers: {},
      clock: new FakeClock(),
      logger: new RecordingLogger(),
    });

    worker.start(1_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await worker.stop();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(relays).toBe(3);
  });

  it('logs a failing tick and keeps ticking', async () => {
    vi.useFakeTimers();
    const logger = new RecordingLogger();
    const failing = {
      relay: () => Promise.reject(new Error('outbox down')),
    } as unknown as OutboxRelay;
    const worker = new InProcessWorker({
      relay: failing,
      queue: new MemoryJobQueue(),
      handlers: {},
      clock: new FakeClock(),
      logger,
    });

    worker.start(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await worker.stop();

    expect(logger.warnings).toEqual([
      { message: 'In-process worker tick failed', fields: { error: 'Error' } },
      { message: 'In-process worker tick failed', fields: { error: 'Error' } },
    ]);
  });
});
