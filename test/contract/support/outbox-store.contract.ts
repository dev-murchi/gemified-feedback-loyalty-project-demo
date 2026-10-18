// The OutboxStore contract (ADR-005): the same cases run against the in-memory outbox and against
// PostgreSQL's OUTBOX table. A claim is a lease: until it ends no other claim returns the record.

import type { OutboxRecord } from '../../../src/shared-kernel/outbox-record.js';
import type {
  ClaimedOutboxRecord,
  OutboxStore,
} from '../../../src/shared-kernel/outbox-store.js';

export interface OutboxStoreHarness {
  readonly outbox: OutboxStore;
  /** Writes a record as a unit of work would. */
  add(record: OutboxRecord): Promise<void>;
  /** Every record not yet published, claimed or not, oldest first. */
  waiting(): Promise<readonly OutboxRecord[]>;
  dispose(): Promise<void>;
}

const uuid = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const outboxRecord = (n: number, createdAt: Date): OutboxRecord => ({
  id: uuid('00000000', n),
  eventType: 'FeedbackSubmitted',
  aggregateId: uuid('0000000f', n),
  payload: {
    type: 'FeedbackSubmitted',
    aggregateId: uuid('0000000f', n),
    occurredAt: createdAt,
  },
  createdAt,
  attempts: 0,
  lastError: null,
  publishedAt: null,
  claimedUntil: null,
});

const at = (minute: number, second = 0) =>
  new Date(Date.UTC(2026, 9, 16, 9, minute, second));

const LEASE_MS = 30_000;

export function outboxStoreContract(
  makeHarness: () => Promise<OutboxStoreHarness>,
): void {
  let harness: OutboxStoreHarness;
  const claimed = (limit: number, now: Date) =>
    harness.outbox.claim(limit, now, LEASE_MS);
  const claimedIds = async (limit: number, now: Date) =>
    (await claimed(limit, now)).map((r) => r.id);
  const id = (n: number) => outboxRecord(n, at(n)).id;
  /** The one record a claim returns; the test fails if it returned another number. */
  const claimOne = async (now: Date): Promise<ClaimedOutboxRecord> => {
    const [record, ...rest] = await claimed(1, now);
    if (record === undefined || rest.length > 0)
      throw new Error('expected exactly one claimed record');
    return record;
  };

  beforeEach(async () => {
    harness = await makeHarness();
    await harness.add(outboxRecord(2, at(2)));
    await harness.add(outboxRecord(1, at(1)));
    await harness.add(outboxRecord(3, at(3)));
  });

  afterEach(() => harness.dispose());

  it('claims unpublished records oldest first, up to a limit, and shows the lease', async () => {
    const records = await claimed(2, at(10));

    expect(records.map((r) => r.id)).toEqual([id(1), id(2)]);
    expect(records.map((r) => r.claimedUntil)).toEqual([
      at(10, 30),
      at(10, 30),
    ]);
    expect(records[0]).toMatchObject({
      eventType: 'FeedbackSubmitted',
      payload: { type: 'FeedbackSubmitted' },
      attempts: 0,
      lastError: null,
      publishedAt: null,
    });
  });

  it('does not give a record to a second claim while its lease holds', async () => {
    // Given a first claim of two records
    await claimedIds(2, at(10));

    // When a second claim comes before the lease ends
    const second = await claimedIds(10, at(10, 29));

    // Then it gets only the record nobody holds
    expect(second).toEqual([id(3)]);
    expect(await claimedIds(10, at(10, 29))).toEqual([]);
  });

  it('gives the record again once the lease has ended, as when its relay died', async () => {
    // Given a claim whose relay never marked anything
    await claimedIds(3, at(10));

    // When the lease ends (to the millisecond) and a later claim comes
    const afterLease = await claimedIds(10, at(10, 30));

    // Then all three are claimable again, with a new lease
    expect(afterLease).toEqual([id(1), id(2), id(3)]);
    expect(await claimedIds(10, at(10, 31))).toEqual([]);
  });

  it('never claims a published record again, and clears its lease', async () => {
    const first = await claimOne(at(10));

    expect(await harness.outbox.markPublished(first, at(10, 1))).toBe(true);

    expect(await claimedIds(10, at(20))).toEqual([id(2), id(3)]);
    expect((await harness.waiting()).map((r) => r.id)).toEqual([id(2), id(3)]);
  });

  it('counts a failed hand-over, keeps the reason, and releases the lease for the next claim', async () => {
    // Given a claimed record that fails twice
    const first = await claimOne(at(10));
    expect(
      await harness.outbox.markFailed(first, 'Error: queue unavailable'),
    ).toBe(true);
    const again = await claimOne(at(10, 1));
    await harness.outbox.markFailed(again, 'Error: queue unavailable again');

    // Then it is waiting with its attempts and reason, and claimable at once
    const [waiting] = await harness.waiting();
    expect(waiting).toMatchObject({
      id: id(1),
      attempts: 2,
      lastError: 'Error: queue unavailable again',
      publishedAt: null,
      claimedUntil: null,
    });
    expect(await claimedIds(1, at(10, 2))).toEqual([id(1)]);
  });

  describe('fencing: a mark changes the record only while its lease is the one presented', () => {
    /** Relay A claims a record; its lease runs out; relay B claims the same record. */
    async function leasePassesToAnotherRelay() {
      const a = await claimOne(at(10));
      const b = await claimOne(at(10, 30));
      expect(b.id).toBe(a.id);
      expect(b.claimedUntil).toEqual(at(11, 0));
      return { a, b };
    }
    const stored = async (n: number) =>
      (await harness.waiting()).find((r) => r.id === id(n));

    it('ignores a late markFailed of the relay whose lease ran out: no attempt, no lost lease', async () => {
      const { a, b } = await leasePassesToAnotherRelay();

      expect(await harness.outbox.markFailed(a, 'Error: too late')).toBe(false);

      // B still holds the record, untouched
      expect(await stored(1)).toMatchObject({
        attempts: 0,
        lastError: null,
        publishedAt: null,
        claimedUntil: b.claimedUntil,
      });
      expect(await claimedIds(10, at(10, 59))).not.toContain(id(1));
    });

    it('ignores a late markPublished of the relay whose lease ran out, and lets the holder publish', async () => {
      const { a, b } = await leasePassesToAnotherRelay();

      expect(await harness.outbox.markPublished(a, at(10, 40))).toBe(false);
      expect(await stored(1)).toMatchObject({
        publishedAt: null,
        claimedUntil: b.claimedUntil,
      });

      expect(await harness.outbox.markPublished(b, at(10, 41))).toBe(true);
      expect((await harness.waiting()).map((r) => r.id)).not.toContain(id(1));
    });

    it('ignores a late mark of a relay once the other relay has published the record', async () => {
      const { a, b } = await leasePassesToAnotherRelay();
      await harness.outbox.markPublished(b, at(10, 40));

      expect(await harness.outbox.markFailed(a, 'Error: too late')).toBe(false);
      expect(await harness.outbox.markPublished(a, at(10, 50))).toBe(false);
      expect(await claimedIds(10, at(30))).toEqual([id(2), id(3)]);
    });

    it('does not let a mark succeed twice with the same lease', async () => {
      const first = await claimOne(at(10));
      await harness.outbox.markPublished(first, at(10, 1));

      expect(await harness.outbox.markPublished(first, at(10, 2))).toBe(false);
      expect(await harness.outbox.markFailed(first, 'Error: x')).toBe(false);
    });

    it('marks nothing for a record that does not exist', async () => {
      const unknown = { id: id(9), claimedUntil: at(10, 30) };

      expect(await harness.outbox.markPublished(unknown, at(5))).toBe(false);
      expect(await harness.outbox.markFailed(unknown, 'Error: x')).toBe(false);
    });
  });
}
