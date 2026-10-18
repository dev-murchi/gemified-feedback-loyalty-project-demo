// What only the PostgreSQL unit of work does: real concurrent transactions on pooled connections.
// The shared behaviour is the UnitOfWork contract (pg-unit-of-work.contract.spec.ts).

import { fixedRoutes } from '../../../src/shared-kernel/event-routing.js';
import { waitingOutbox } from '../../support/pg-outbox-rows.js';
import { PgUnitOfWork } from '../../../src/platform/postgres/pg-unit-of-work.js';
import { FakeClock } from '../../support/fake-clock.js';
import {
  emptyTables,
  freshDatabase,
  type TestDatabase,
} from '../../support/postgres.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

const FEEDBACK_A = '00000000-0000-4000-8000-00000000000a';
const FEEDBACK_B = '00000000-0000-4000-8000-00000000000b';

let testDb: TestDatabase;

beforeAll(async () => {
  // Two connections: enough for two concurrent units of work, few enough to notice a leak.
  testDb = await freshDatabase({ maxConnections: 2 });
  await testDb.db.query('CREATE TABLE rows (value text PRIMARY KEY)');
});

beforeEach(() => emptyTables(testDb.db));

// A test that fails while a unit of work is held open must not leave its connection taken.
const stillOpen: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stillOpen.splice(0).map((close) => close()));
});

afterAll(() => testDb.drop());

const unitOfWork = () =>
  new PgUnitOfWork({
    db: testDb.db,
    routes: fixedRoutes({ FeedbackSubmitted: { outbox: true } }),
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
  });

const insert = async (value: string) => {
  await testDb.db.query('INSERT INTO rows (value) VALUES ($1)', [value]);
};

const committedRows = async () =>
  (
    await testDb.db.query<{ value: string }>(
      'SELECT value FROM rows ORDER BY value',
    )
  ).rows.map((row) => row.value);

const submitted = (aggregateId: string) => ({
  type: 'FeedbackSubmitted',
  aggregateId,
  occurredAt: new Date('2026-10-18T09:00:00.000Z'),
});

/** A unit of work that does `work`, then stays open until `finish` is called. */
function heldOpen(uow: PgUnitOfWork, work: () => Promise<void>) {
  let started = (): void => undefined;
  let finish: (error?: Error) => void = () => undefined;
  const ready = new Promise<void>((resolve) => (started = resolve));
  const done = uow.run(async () => {
    await work();
    started();
    await new Promise<void>((resolve, reject) => {
      finish = (error) => (error ? reject(error) : resolve());
    });
  });
  stillOpen.push(() => {
    finish(new Error('closed after the test'));
    return done.then(
      () => undefined,
      () => undefined,
    );
  });
  return { ready, done, finish: (error?: Error) => finish(error) };
}

describe('PgUnitOfWork (PostgreSQL)', () => {
  it('refuses a unit of work started inside another and rolls the outer one back', async () => {
    // Given a unit of work that has written a row
    const uow = unitOfWork();

    // When it starts another unit of work inside itself, as a misbehaving handler would
    const run = uow.run(async () => {
      await insert('outer');
      await uow.run(() => insert('inner'));
    });

    // Then it fails at once instead of waiting on itself, and nothing is stored
    await expect(run).rejects.toThrow('already running');
    expect(await committedRows()).toEqual([]);
  });

  it('runs concurrent units of work in separate transactions', async () => {
    // Given a unit of work that has inserted a row and is still open
    const uow = unitOfWork();
    const first = heldOpen(uow, () => insert('first'));
    await first.ready;

    // When a second unit of work runs and commits meanwhile
    await uow.run(() => insert('second'));

    // Then the second did not wait for the first, and nobody sees the first's uncommitted row
    expect(await committedRows()).toEqual(['second']);

    // And when the first then fails, only its own change is undone
    first.finish(new Error('first failed'));
    await expect(first.done).rejects.toThrow('first failed');
    expect(await committedRows()).toEqual(['second']);
  });

  it('keeps the events of concurrent units of work apart', async () => {
    // Given a unit of work that has collected an outbox-routed event and is still open
    const uow = unitOfWork();
    const first = heldOpen(uow, () =>
      Promise.resolve(uow.collect([submitted(FEEDBACK_A)])),
    );
    await first.ready;

    // When a second unit of work collects its own event and commits meanwhile
    await uow.run(() => Promise.resolve(uow.collect([submitted(FEEDBACK_B)])));

    // Then the second delivered only its own event
    const unpublished = () => waitingOutbox(testDb.db);
    expect((await unpublished()).map((r) => r.aggregateId)).toEqual([
      FEEDBACK_B,
    ]);

    // And when the first fails, its event is never written
    first.finish(new Error('first failed'));
    await expect(first.done).rejects.toThrow('first failed');
    expect((await unpublished()).map((r) => r.aggregateId)).toEqual([
      FEEDBACK_B,
    ]);
  });

  it('gives its connection back after every failure', async () => {
    // Given a pool of two connections
    const uow = unitOfWork();

    // When ten units of work fail one after another, after using their connection
    for (let i = 0; i < 10; i += 1) {
      await expect(
        uow.run(async () => {
          await insert(`attempt-${i}`);
          throw new Error('work failed');
        }),
      ).rejects.toThrow('work failed');
    }

    // Then a further unit of work still gets a connection and commits
    await uow.run(() => insert('after'));
    expect(await committedRows()).toEqual(['after']);
  });
});
