import { InMemoryTable } from '../../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import { MemoryJobQueue } from '../../../src/shared-kernel/adapters/memory-job-queue.js';
import { MemoryOutboxStore } from '../../../src/shared-kernel/adapters/memory-outbox-store.js';
import type { DomainEvent } from '../../../src/shared-kernel/domain-event.js';
import { fixedRoutes } from '../../../src/shared-kernel/event-routing.js';
import type { JobQueue } from '../../../src/shared-kernel/job-queue.js';
import { OutboxRelay } from '../../../src/shared-kernel/outbox-relay.js';
import type { OutboxRecord } from '../../../src/shared-kernel/outbox-record.js';
import type { OutboxStore } from '../../../src/shared-kernel/outbox-store.js';
import { FakeClock } from '../../support/fake-clock.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

const QUEUES = { FeedbackSubmitted: 'analysis' };

describe('OutboxRelay (ADR-005, TZ-4)', () => {
  let clock: FakeClock;
  let table: InMemoryTable<string, OutboxRecord>;
  let outbox: MemoryOutboxStore;
  let queue: MemoryJobQueue;
  let uow: InMemoryUnitOfWork;

  const submitted = (n: number, type = 'FeedbackSubmitted'): DomainEvent => ({
    type,
    aggregateId: `feedback-${n}`,
    occurredAt: clock.now(),
  });

  /** Writes events to the outbox the way a unit of work does. */
  const commit = (...events: DomainEvent[]) =>
    uow.run(() => Promise.resolve(uow.collect(events)));

  const relayWith = (
    overrides: { queue?: JobQueue; outbox?: OutboxStore } = {},
  ) =>
    new OutboxRelay({
      outbox: overrides.outbox ?? outbox,
      queue: overrides.queue ?? queue,
      queues: QUEUES,
      clock,
    });

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-10-16T09:00:00.000Z'));
    table = new InMemoryTable();
    outbox = new MemoryOutboxStore(table);
    queue = new MemoryJobQueue();
    uow = new InMemoryUnitOfWork({
      routes: fixedRoutes({
        FeedbackSubmitted: { outbox: true },
        Unrouted: { outbox: true },
      }),
      tables: [],
      outbox: table,
      clock,
      ids: new SequentialIdGenerator(),
    });
  });

  it('hands each committed event to its queue, with the outbox id as the job id, and marks it published', async () => {
    await commit(submitted(1), submitted(2));
    clock.advance(1_000);

    expect(await relayWith().relay()).toEqual({ published: 2, failed: 0 });

    const [first, second] = table
      .values()
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(queue.jobsOf('analysis')).toEqual([
      { queue: 'analysis', id: first?.id, payload: first?.payload },
      { queue: 'analysis', id: second?.id, payload: second?.payload },
    ]);
    expect(table.values().map((r) => r.publishedAt)).toEqual([
      clock.now(),
      clock.now(),
    ]);
  });

  it('sends nothing again once everything is published', async () => {
    await commit(submitted(1));
    await relayWith().relay();

    expect(await relayWith().relay()).toEqual({ published: 0, failed: 0 });
    expect(queue.jobsOf('analysis')).toHaveLength(1);
  });

  it('keeps a record waiting, with its attempt and reason, when the queue refuses it; the rest still go', async () => {
    await commit(submitted(1), submitted(2));
    let calls = 0;
    const flaky: JobQueue = {
      enqueue: (job) => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new Error('queue unavailable'))
          : queue.enqueue(job);
      },
    };

    expect(await relayWith({ queue: flaky }).relay()).toEqual({
      published: 1,
      failed: 1,
    });

    const waiting = await outbox.unpublished(10);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({
      attempts: 1,
      lastError: 'Error: queue unavailable',
    });
    expect(await relayWith().relay()).toEqual({ published: 1, failed: 0 });
  });

  it('runs a job once although a crash between enqueue and mark hands it over twice (at least once)', async () => {
    await commit(submitted(1));
    const crashing: OutboxStore = {
      unpublished: (limit) => outbox.unpublished(limit),
      markPublished: () => Promise.reject(new Error('crashed before marking')),
      markFailed: (id, reason) => outbox.markFailed(id, reason),
    };

    await relayWith({ outbox: crashing }).relay();
    await relayWith().relay();

    expect(queue.jobsOf('analysis')).toHaveLength(1);
    expect(await outbox.unpublished(10)).toEqual([]);
  });

  it('marks an event type without a queue as failed, a wiring error, without stopping the others', async () => {
    await commit(submitted(1, 'Unrouted'), submitted(2));

    expect(await relayWith().relay()).toEqual({ published: 1, failed: 1 });
    expect((await outbox.unpublished(10))[0]?.lastError).toBe(
      'Error: No queue for event type "Unrouted"',
    );
  });

  it('never writes the payload into a failure reason', async () => {
    await commit({
      ...submitted(1),
      secretMarker: 'PAYLOAD-SECRET',
    } as DomainEvent);
    const refusing: JobQueue = {
      enqueue: () => Promise.reject(new Error('down')),
    };

    await relayWith({ queue: refusing }).relay();

    expect(
      JSON.stringify(table.values().map((r) => r.lastError)),
    ).not.toContain('PAYLOAD-SECRET');
  });

  it('takes at most a batch per run, oldest first', async () => {
    await commit(submitted(1));
    clock.advance(1_000);
    await commit(submitted(2));

    expect(await relayWith().relay(1)).toEqual({ published: 1, failed: 0 });
    expect(
      queue
        .jobsOf('analysis')
        .map((job) => (job.payload as DomainEvent).aggregateId),
    ).toEqual(['feedback-1']);
  });
});
