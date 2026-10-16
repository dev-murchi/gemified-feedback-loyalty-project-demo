// The OutboxStore contract (ADR-005): the same cases run against the in-memory outbox and, in
// S0-11, against PostgreSQL's OUTBOX table.

import type { OutboxRecord } from '../../../src/shared-kernel/outbox-record.js';
import type { OutboxStore } from '../../../src/shared-kernel/outbox-store.js';

export interface OutboxStoreHarness {
  readonly outbox: OutboxStore;
  /** Writes a record as a unit of work would. */
  add(record: OutboxRecord): Promise<void>;
  dispose(): Promise<void>;
}

export const outboxRecord = (n: number, createdAt: Date): OutboxRecord => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  eventType: 'FeedbackSubmitted',
  aggregateId: `feedback-${n}`,
  payload: {
    type: 'FeedbackSubmitted',
    aggregateId: `feedback-${n}`,
    occurredAt: createdAt,
  },
  createdAt,
  attempts: 0,
  lastError: null,
  publishedAt: null,
});

const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 9, minute));

export function outboxStoreContract(
  makeHarness: () => Promise<OutboxStoreHarness>,
): void {
  let harness: OutboxStoreHarness;
  const ids = async (limit = 10) =>
    (await harness.outbox.unpublished(limit)).map((r) => r.id);

  beforeEach(async () => {
    harness = await makeHarness();
    await harness.add(outboxRecord(2, at(2)));
    await harness.add(outboxRecord(1, at(1)));
    await harness.add(outboxRecord(3, at(3)));
  });

  afterEach(() => harness.dispose());

  it('gives unpublished records oldest first, up to a limit', async () => {
    expect(await ids()).toEqual([
      outboxRecord(1, at(1)).id,
      outboxRecord(2, at(2)).id,
      outboxRecord(3, at(3)).id,
    ]);
    expect(await ids(1)).toEqual([outboxRecord(1, at(1)).id]);
  });

  it('no longer gives a record once it is marked published', async () => {
    await harness.outbox.markPublished(outboxRecord(1, at(1)).id, at(5));

    expect(await ids()).toEqual([
      outboxRecord(2, at(2)).id,
      outboxRecord(3, at(3)).id,
    ]);
  });

  it('counts a failed hand-over, keeps the reason, and keeps the record waiting', async () => {
    await harness.outbox.markFailed(
      outboxRecord(1, at(1)).id,
      'Error: queue unavailable',
    );
    await harness.outbox.markFailed(
      outboxRecord(1, at(1)).id,
      'Error: queue unavailable again',
    );

    const [first] = await harness.outbox.unpublished(1);
    expect(first).toMatchObject({
      attempts: 2,
      lastError: 'Error: queue unavailable again',
      publishedAt: null,
    });
  });

  it('refuses to mark a record that does not exist', async () => {
    await expect(
      harness.outbox.markPublished('unknown', at(5)),
    ).rejects.toThrow();
  });
}
