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
import { RecordingLogger } from '../../support/recording-logger.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

const QUEUES = { FeedbackSubmitted: 'analysis' };

describe('OutboxRelay (ADR-005, TZ-4)', () => {
  let clock: FakeClock;
  let table: InMemoryTable<string, OutboxRecord>;
  let outbox: MemoryOutboxStore;
  let queue: MemoryJobQueue;
  let uow: InMemoryUnitOfWork;
  let logger: RecordingLogger;

  const submitted = (n: number, type = 'FeedbackSubmitted'): DomainEvent => ({
    type,
    aggregateId: `feedback-${n}`,
    occurredAt: clock.now(),
  });

  /** Records not yet published, claimed or not, oldest first. */
  const waiting = () =>
    table
      .values()
      .filter((record) => record.publishedAt === null)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  /** Writes events to the outbox the way a unit of work does. */
  const commit = (...events: DomainEvent[]) =>
    uow.run(() => Promise.resolve(uow.collect(events)));

  const relayWith = (
    overrides: {
      queue?: JobQueue;
      outbox?: OutboxStore;
      leaseMs?: number;
    } = {},
  ) =>
    new OutboxRelay({
      outbox: overrides.outbox ?? outbox,
      queue: overrides.queue ?? queue,
      queues: QUEUES,
      clock,
      logger,
      ...(overrides.leaseMs === undefined
        ? {}
        : { leaseMs: overrides.leaseMs }),
    });

  beforeEach(() => {
    clock = new FakeClock(new Date('2026-10-16T09:00:00.000Z'));
    table = new InMemoryTable();
    outbox = new MemoryOutboxStore(table);
    queue = new MemoryJobQueue();
    logger = new RecordingLogger();
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

    expect(waiting()).toHaveLength(1);
    expect(waiting()[0]).toMatchObject({
      attempts: 1,
      lastError: 'Error: queue unavailable',
    });
    expect(await relayWith().relay()).toEqual({ published: 1, failed: 0 });
  });

  it('runs a job once although a crash between enqueue and mark hands it over twice (at least once)', async () => {
    await commit(submitted(1));
    const crashing: OutboxStore = {
      claim: (limit, at, leaseMs) => outbox.claim(limit, at, leaseMs),
      markPublished: () => Promise.reject(new Error('crashed before marking')),
      markFailed: (lease, reason) => outbox.markFailed(lease, reason),
    };

    await relayWith({ outbox: crashing }).relay();
    await relayWith().relay();

    expect(queue.jobsOf('analysis')).toHaveLength(1);
    expect(waiting()).toEqual([]);
  });

  it('marks an event type without a queue as failed, a wiring error, without stopping the others', async () => {
    await commit(submitted(1, 'Unrouted'), submitted(2));

    expect(await relayWith().relay()).toEqual({ published: 1, failed: 1 });
    expect(waiting()[0]?.lastError).toBe(
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

  describe('with several relays (the lease)', () => {
    const LEASE_MS = 30_000;

    it('leaves the records a relay is handing over to that relay: a second relay at the same time hands over nothing', async () => {
      // Given a relay that is still enqueueing its record
      await commit(submitted(1));
      let release = (): void => undefined;
      const slow: JobQueue = {
        enqueue: async (job) => {
          await new Promise<void>((resolve) => (release = resolve));
          await queue.enqueue(job);
        },
      };
      const first = relayWith({ queue: slow }).relay();
      await vi.waitFor(() => expect(release).not.toBe(undefined));

      // When a second relay runs meanwhile
      const second = await relayWith().relay();

      // Then it has nothing to take; the first finishes, and the job was handed over once
      expect(second).toEqual({ published: 0, failed: 0 });
      release();
      expect(await first).toEqual({ published: 1, failed: 0 });
      expect(queue.jobsOf('analysis')).toHaveLength(1);
    });

    it('hands over the records of a relay that died, but only after its lease has ended', async () => {
      // Given a relay that claimed a record and died before it enqueued anything
      await commit(submitted(1));
      await outbox.claim(10, clock.now(), LEASE_MS);

      // When another relay runs before, then at the end of the lease
      const early = await relayWith().relay();
      clock.advance(LEASE_MS - 1);
      const justBefore = await relayWith().relay();
      clock.advance(1);
      const afterLease = await relayWith().relay();

      // Then it takes the record only once the lease has ended
      expect([early, justBefore, afterLease]).toEqual([
        { published: 0, failed: 0 },
        { published: 0, failed: 0 },
        { published: 1, failed: 0 },
      ]);
      expect(queue.jobsOf('analysis')).toHaveLength(1);
    });

    it('leaves a record to the relay that now holds it when its own lease ran out mid-batch', async () => {
      // Given a relay that is slow: still enqueueing when its lease ends
      await commit(submitted(1));
      let release = (): void => undefined;
      const slow: JobQueue = {
        enqueue: async (job) => {
          await new Promise<void>((resolve) => (release = resolve));
          await queue.enqueue(job);
        },
      };
      const slowRelay = relayWith({ queue: slow }).relay();
      await vi.waitFor(() => expect(release).not.toBe(undefined));

      // And another relay claims the record after the lease and publishes it
      clock.advance(LEASE_MS);
      expect(await relayWith().relay()).toEqual({ published: 1, failed: 0 });

      // When the slow relay finishes and tries to mark
      release();
      const result = await slowRelay;

      // Then its mark changed nothing: neither published nor failed, one warning without data,
      // the record stays as the other relay left it, and the job exists once
      expect(result).toEqual({ published: 0, failed: 0 });
      expect(logger.warnings).toEqual([
        {
          message:
            'Outbox lease passed to another relay before the records were marked',
          fields: { records: 1 },
        },
      ]);
      expect(waiting()).toEqual([]);
      expect(table.values()[0]).toMatchObject({ attempts: 0, lastError: null });
      expect(queue.jobsOf('analysis')).toHaveLength(1);
    });

    it('does not count a failed hand-over of a relay that lost its lease as a failure, nor give the record an attempt', async () => {
      // Given a relay whose queue refuses, but only after another relay took over the record
      await commit(submitted(1));
      let refuse: (error: Error) => void = () => undefined;
      const refusing: JobQueue = {
        enqueue: () =>
          new Promise<void>((_resolve, reject) => (refuse = reject)),
      };
      const slowRelay = relayWith({ queue: refusing }).relay();
      await vi.waitFor(() => expect(refuse).not.toBe(undefined));
      clock.advance(LEASE_MS);
      await relayWith().relay();

      // When the first relay's hand-over fails
      refuse(new Error('queue unavailable'));

      // Then it is neither a failure nor an attempt on the record
      expect(await slowRelay).toEqual({ published: 0, failed: 0 });
      expect(table.values()[0]).toMatchObject({ attempts: 0, lastError: null });
      expect(logger.warnings).toHaveLength(1);
    });

    it('holds a record for the lease it is configured with', async () => {
      // Given a relay with a lease of one minute that hangs in the queue
      await commit(submitted(1));
      const hanging: JobQueue = { enqueue: () => new Promise(() => undefined) };
      const stuck = relayWith({ queue: hanging, leaseMs: 60_000 }).relay();
      await vi.waitFor(() =>
        expect(table.values()[0]?.claimedUntil).not.toBeNull(),
      );

      // When another relay runs 31 seconds later, then at a minute
      clock.advance(31_000);
      const early = await relayWith().relay();
      clock.advance(29_000);
      const afterLease = await relayWith().relay();

      // Then the record was held the full minute
      expect(early.published).toBe(0);
      expect(afterLease.published).toBe(1);
      void stuck;
    });
  });
});
