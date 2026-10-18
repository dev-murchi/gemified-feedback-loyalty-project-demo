// The outbox relay on real PostgreSQL (SDD 9.1, docs/07 §5): several relays, leases, a relay that
// dies, and never a transaction open while the queue is called. The single-relay behaviour is in
// test/unit/shared-kernel/outbox-relay.spec.ts; the claim itself is the OutboxStore contract.

import {
  insertOutboxRecord,
  PgOutboxStore,
} from '../../../src/platform/postgres/pg-outbox-store.js';
import {
  createPgDatabase,
  type PgDatabase,
} from '../../../src/platform/postgres/pg-database.js';
import type { JobQueue } from '../../../src/shared-kernel/job-queue.js';
import { OutboxRelay } from '../../../src/shared-kernel/outbox-relay.js';
import { outboxRecord } from '../../contract/support/outbox-store.contract.js';
import { FakeClock } from '../../support/fake-clock.js';
import { waitingOutbox } from '../../support/pg-outbox-rows.js';
import {
  emptyTables,
  freshDatabase,
  type TestDatabase,
} from '../../support/postgres.js';
import { waitFor } from '../../support/wait-for.js';

const LEASE_MS = 30_000;

let testDb: TestDatabase;
/** The probe's own pool: it must never join a transaction that the code under test has open. */
let probe: PgDatabase;
let clock: FakeClock;

beforeAll(async () => {
  testDb = await freshDatabase();
  probe = createPgDatabase({ url: testDb.url }, testDb.logger);
});

beforeEach(async () => {
  await emptyTables(testDb.db);
  clock = new FakeClock(new Date('2026-10-18T09:00:00.000Z'));
});

afterAll(async () => {
  await probe.end();
  await testDb.drop();
});

async function addRecords(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let n = 1; n <= count; n += 1) {
    const record = outboxRecord(n, new Date(clock.now().getTime() + n * 1_000));
    await testDb.db.transaction(() => insertOutboxRecord(testDb.db, record));
    ids.push(record.id);
  }
  clock.advance(60_000);
  return ids;
}

const relayOver = (queue: JobQueue) =>
  new OutboxRelay({
    outbox: new PgOutboxStore(testDb.db),
    queue,
    queues: { FeedbackSubmitted: 'analysis' },
    clock,
    logger: testDb.logger,
    leaseMs: LEASE_MS,
  });

// A test that fails while a hand-over is held must not leave its relay hanging until the timeout.
const holds: (() => void)[] = [];
afterEach(() => holds.splice(0).forEach((release) => release()));

/** A queue that keeps each hand-over open until `release` is called, and remembers what it got. */
function holdingQueue() {
  const handedOver: string[] = [];
  let open = 0;
  let mostAtOnce = 0;
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  holds.push(() => release());
  const queue: JobQueue = {
    enqueue: async (job) => {
      open += 1;
      mostAtOnce = Math.max(mostAtOnce, open);
      await released;
      handedOver.push(job.id);
      open -= 1;
    },
  };
  return {
    queue,
    handedOver,
    release,
    open: () => open,
    mostAtOnce: () => mostAtOnce,
  };
}

/**
 * Backends of this database, other than the asking one, that are inside a transaction right now.
 * It asks through the probe's own pool: a query through `testDb.db` made while the code under test
 * has a transaction open would run on that very transaction and not see it.
 */
const openTransactions = async (): Promise<number> =>
  (
    await probe.query<{ open: number }>(
      `SELECT count(*)::int AS open FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid()
         AND xact_start IS NOT NULL`,
    )
  ).rows[0]?.open ?? -1;

describe('OutboxRelay on PostgreSQL', () => {
  it('hands every record over exactly once when two relays run at the same time', async () => {
    // Given six unpublished records and a queue that holds hand-overs open
    const ids = await addRecords(6);
    const held = holdingQueue();

    // When two relays each take a batch of three, at the same time
    const first = relayOver(held.queue).relay(3);
    const second = relayOver(held.queue).relay(3);
    await waitFor(() => held.open() === 2, 'both relays to be enqueueing');
    held.release();

    // Then both worked at once, each took different records, and each was handed over once
    expect(await first).toEqual({ published: 3, failed: 0 });
    expect(await second).toEqual({ published: 3, failed: 0 });
    expect(held.mostAtOnce()).toBe(2);
    expect([...held.handedOver].sort()).toEqual([...ids].sort());
    expect(await waitingOutbox(testDb.db)).toEqual([]);
  });

  it('hands nothing over to a second relay while the first relay holds the lease', async () => {
    // Given a relay that has claimed three records and is still handing them over
    const ids = await addRecords(3);
    const held = holdingQueue();
    const first = relayOver(held.queue).relay(3);
    await waitFor(() => held.open() === 1, 'the first relay to be enqueueing');

    // When a second relay runs, with all the time it likes before the lease ends
    clock.advance(LEASE_MS - 1);
    const second = await relayOver(held.queue).relay(3);

    // Then it takes nothing, and the first finishes the job alone
    expect(second).toEqual({ published: 0, failed: 0 });
    held.release();
    expect(await first).toEqual({ published: 3, failed: 0 });
    expect([...held.handedOver].sort()).toEqual([...ids].sort());
  });

  it('hands over the records of a relay that died, but only after its lease has ended', async () => {
    // Given a relay that claimed three records and died before enqueueing anything
    const ids = await addRecords(3);
    await new PgOutboxStore(testDb.db).claim(3, clock.now(), LEASE_MS);
    const handedOver: string[] = [];
    const queue: JobQueue = {
      enqueue: (job) => Promise.resolve(void handedOver.push(job.id)),
    };

    // When another relay runs while the lease holds, and again the moment it has ended
    clock.advance(LEASE_MS - 1);
    const during = await relayOver(queue).relay();
    clock.advance(1);
    const after = await relayOver(queue).relay();

    // Then it waited for the lease and then handed all three over
    expect(during).toEqual({ published: 0, failed: 0 });
    expect(after).toEqual({ published: 3, failed: 0 });
    expect([...handedOver].sort()).toEqual([...ids].sort());
  });

  it('leaves the records to the relay that took them over when its own lease ran out mid-batch', async () => {
    // Given a slow relay that has claimed a record and is still handing it over
    const [id = ''] = await addRecords(1);
    const held = holdingQueue();
    const slow = relayOver(held.queue).relay();
    await waitFor(() => held.open() === 1, 'the slow relay to be enqueueing');

    // And its lease ends, and another relay claims, hands over and publishes the record
    clock.advance(LEASE_MS);
    const quick: string[] = [];
    const fast = await relayOver({
      enqueue: (job) => Promise.resolve(void quick.push(job.id)),
    }).relay();
    expect(fast).toEqual({ published: 1, failed: 0 });

    // When the slow relay finishes and marks
    held.release();
    const result = await slow;

    // Then its late mark changed nothing: neither published nor failed, the record stays published
    // by the other relay, with no attempt on it, and the queue saw the same job id twice
    expect(result).toEqual({ published: 0, failed: 0 });
    expect(await waitingOutbox(testDb.db)).toEqual([]);
    const { rows } = await testDb.db.query<{ attempts: number }>(
      'SELECT attempts FROM outbox WHERE id = $1',
      [id],
    );
    expect(rows).toEqual([{ attempts: 0 }]);
    expect([...held.handedOver, ...quick]).toEqual([id, id]);
  });

  it('never has a transaction open while it calls the queue', async () => {
    // Given three records and a queue that looks at the database during every hand-over
    await addRecords(3);
    const seen: number[] = [];
    const queue: JobQueue = {
      enqueue: async () => {
        seen.push(await openTransactions());
      },
    };

    // When the relay hands them over
    expect(await relayOver(queue).relay()).toEqual({ published: 3, failed: 0 });

    // Then no transaction (and so no row lock and no held connection) was open at any call
    expect(seen).toEqual([0, 0, 0]);
  });

  it('sees an open transaction when there is one (the probe above is not blind)', async () => {
    // When a transaction is open, with work done in it, and the probe asks meanwhile
    const seen = await testDb.db.transaction(async () => {
      await testDb.db.query('SELECT 1');
      return openTransactions();
    });

    // Then the probe counts it, and counts nothing once it is closed
    expect(seen).toBe(1);
    expect(await openTransactions()).toBe(0);
  });

  it('refuses to run inside a transaction at all (docs/07 §5)', async () => {
    const store = new PgOutboxStore(testDb.db);
    const [id = ''] = await addRecords(1);
    const lease = { id, claimedUntil: clock.now() };

    await expect(
      testDb.db.transaction(() => store.claim(1, clock.now(), LEASE_MS)),
    ).rejects.toThrow('must not run inside a transaction');
    await expect(
      testDb.db.transaction(() => store.markPublished(lease, clock.now())),
    ).rejects.toThrow('must not run inside a transaction');
    await expect(
      testDb.db.transaction(() => store.markFailed(lease, 'Error: x')),
    ).rejects.toThrow('must not run inside a transaction');
  });
});
