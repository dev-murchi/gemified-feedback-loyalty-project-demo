// What the PostgreSQL optimistic lock does under real concurrency, and the edges the contract does
// not reach: composite keys, other unique constraints, and the events of a save.

import { waitingOutbox } from '../../support/pg-outbox-rows.js';
import { PgUnitOfWork } from '../../../src/platform/postgres/pg-unit-of-work.js';
import { writeVersioned } from '../../../src/platform/postgres/versioned-write.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import { fixedRoutes } from '../../../src/shared-kernel/event-routing.js';
import { FakeClock } from '../../support/fake-clock.js';
import {
  emptyTables,
  freshDatabase,
  type TestDatabase,
} from '../../support/postgres.js';
import {
  PgVersionedThingRepository,
  VERSIONED_THINGS_TABLE,
} from '../../support/pg-versioned-thing.repository.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';
import { VersionedThing } from '../../support/versioned-thing.js';

const ID_A = '00000000-0000-4000-8000-0000000000a1';
const ID_B = '00000000-0000-4000-8000-0000000000b1';

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await freshDatabase();
  const { db } = testDb;
  await db.query(VERSIONED_THINGS_TABLE);
  await db.query(
    `CREATE TABLE pair_things (
       a uuid NOT NULL, b uuid NOT NULL, label text NOT NULL, version integer NOT NULL,
       PRIMARY KEY (a, b))`,
  );
  await db.query(
    `CREATE TABLE labelled_things (
       id uuid PRIMARY KEY, label text NOT NULL UNIQUE, version integer NOT NULL)`,
  );
});

beforeEach(() => emptyTables(testDb.db));

afterAll(() => testDb.drop());

const inTransaction = <T>(work: () => Promise<T>) =>
  testDb.db.transaction(work);

const storedVersion = async (table: string, where = 'true') =>
  (
    await testDb.db.query<{ version: number }>(
      `SELECT version FROM ${table} WHERE ${where}`,
    )
  ).rows.map((row) => row.version);

const writeThing = (id: string, version: number, label = 'thing') =>
  inTransaction(() =>
    writeVersioned(testDb.db, {
      table: 'versioned_things',
      key: { id },
      values: { label },
      version,
    }),
  );

describe('writeVersioned (PostgreSQL)', () => {
  it('lets exactly one of 20 concurrent inserts of the same identity win', async () => {
    // When 20 requests that all found nothing insert the same identity at once
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => writeThing(ID_A, 0)),
    );

    // Then one succeeded and the other 19 conflict
    const conflicts = results.filter(
      (r) =>
        r.status === 'rejected' && r.reason instanceof ConcurrencyConflictError,
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(conflicts).toHaveLength(19);
    expect(await storedVersion('versioned_things')).toEqual([1]);
  });

  it('lets exactly one of 10 concurrent updates from the same version win', async () => {
    // Given a stored row at version 1
    await writeThing(ID_A, 0);

    // When 10 requests that all loaded version 1 update it at once
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => writeThing(ID_A, 1, `label-${i}`)),
    );

    // Then one wins, the rest conflict, and the row is at version 2 exactly
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.filter(
        (r) =>
          r.status === 'rejected' &&
          r.reason instanceof ConcurrencyConflictError,
      ),
    ).toHaveLength(9);
    expect(await storedVersion('versioned_things')).toEqual([2]);
  });

  it('conflicts on an update of a row that does not exist', async () => {
    // When an aggregate that claims to be stored (version 3) has no row
    const run = writeThing(ID_A, 3);

    // Then it conflicts instead of inserting
    await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect(await storedVersion('versioned_things')).toEqual([]);
  });

  it('keys a row by every primary key column', async () => {
    // Given a row for the pair (A, B)
    const write = (a: string, b: string, version: number) =>
      inTransaction(() =>
        writeVersioned(testDb.db, {
          table: 'pair_things',
          key: { a, b },
          values: { label: 'pair' },
          version,
        }),
      );
    await write(ID_A, ID_B, 0);

    // When the same first column is inserted with another second column, the pair is inserted
    // again, and the pair is updated at the right version
    await write(ID_A, ID_A, 0);
    await expect(write(ID_A, ID_B, 0)).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
    const updated = await write(ID_A, ID_B, 1);

    // Then only the repeated pair conflicted, and the update moved that pair alone
    expect(updated).toBe(2);
    expect(await storedVersion('pair_things', `b = '${ID_B}'`)).toEqual([2]);
    expect(await storedVersion('pair_things', `b = '${ID_A}'`)).toEqual([1]);
  });

  it('leaves a unique violation on another column as the database error, not a conflict', async () => {
    // Given a row with label "taken"
    const write = (id: string) =>
      inTransaction(() =>
        writeVersioned(testDb.db, {
          table: 'labelled_things',
          key: { id },
          values: { label: 'taken' },
          version: 0,
        }),
      );
    await write(ID_A);

    // When another identity inserts the same label
    const run = write(ID_B);

    // Then PostgreSQL's unique violation reaches the caller; it is no concurrency conflict
    await expect(run).rejects.not.toBeInstanceOf(ConcurrencyConflictError);
    await expect(run).rejects.toMatchObject({ code: '23505' });
  });
});

describe('saveVersioned (PostgreSQL)', () => {
  const unitOfWork = () =>
    new PgUnitOfWork({
      db: testDb.db,
      routes: fixedRoutes({ ThingTouched: { outbox: true } }),
      clock: new FakeClock(),
      ids: new SequentialIdGenerator(),
    });
  const outbox = async () =>
    (await waitingOutbox(testDb.db)).map((record) => record.aggregateId);

  it("hands the aggregate's events to the unit of work, and they commit with the row", async () => {
    // Given an aggregate that recorded an event
    const uow = unitOfWork();
    const repository = new PgVersionedThingRepository(testDb.db, uow);
    const thing = VersionedThing.create(ID_A);
    thing.touch(new Date('2026-10-18T09:00:00.000Z'));

    // When it is saved in a unit of work
    await uow.run(() => repository.save(thing));

    // Then the event is in the outbox, and a second save does not repeat it
    expect(await outbox()).toEqual([ID_A]);
    await uow.run(() => repository.save(thing));
    expect(await outbox()).toEqual([ID_A]);
  });

  it('writes no event when the save conflicts', async () => {
    // Given a stored thing and a never-stored one with the same identity that recorded an event
    const uow = unitOfWork();
    const repository = new PgVersionedThingRepository(testDb.db, uow);
    await uow.run(() => repository.save(VersionedThing.create(ID_A)));
    const duplicate = VersionedThing.create(ID_A);
    duplicate.touch(new Date('2026-10-18T09:00:00.000Z'));

    // When it is saved
    const run = uow.run(() => repository.save(duplicate));

    // Then the save conflicts and the outbox stays empty
    await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
    expect(await outbox()).toEqual([]);
  });
});
