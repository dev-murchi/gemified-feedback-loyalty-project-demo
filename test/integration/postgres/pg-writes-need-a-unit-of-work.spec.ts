// A write that belongs to a unit of work refuses to run outside one (ADR-005, ADR-014): outside a
// transaction a plain query commits by itself, and the change and its event would no longer commit
// together. The reverse holds for the relay's statements (docs/07 §5, tested in
// pg-outbox-relay.behaviour.spec.ts).

import { insertOutboxRecord } from '../../../src/platform/postgres/pg-outbox-store.js';
import { PgUnitOfWork } from '../../../src/platform/postgres/pg-unit-of-work.js';
import { writeVersioned } from '../../../src/platform/postgres/versioned-write.js';
import { fixedRoutes } from '../../../src/shared-kernel/event-routing.js';
import { outboxRecord } from '../../contract/support/outbox-store.contract.js';
import { FakeClock } from '../../support/fake-clock.js';
import { waitingOutbox } from '../../support/pg-outbox-rows.js';
import {
  PgVersionedThingRepository,
  VERSIONED_THINGS_TABLE,
} from '../../support/pg-versioned-thing.repository.js';
import {
  emptyTables,
  freshDatabase,
  type TestDatabase,
} from '../../support/postgres.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';
import { VersionedThing } from '../../support/versioned-thing.js';

const THING = '00000000-0000-4000-8000-0000000000e1';

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await freshDatabase();
  await testDb.db.query(VERSIONED_THINGS_TABLE);
});

beforeEach(() => emptyTables(testDb.db));

afterAll(() => testDb.drop());

const storedThings = async () =>
  (await testDb.db.query('SELECT id FROM versioned_things')).rows;

const unitOfWork = () =>
  new PgUnitOfWork({
    db: testDb.db,
    routes: fixedRoutes({ ThingTouched: { outbox: true } }),
    clock: new FakeClock(),
    ids: new SequentialIdGenerator(),
  });

describe('writes that belong to a unit of work (PostgreSQL)', () => {
  const refused = 'outside one';

  it('refuses queryInUnitOfWork outside a transaction, and runs it inside one', async () => {
    await expect(testDb.db.queryInUnitOfWork('SELECT 1')).rejects.toThrow(
      refused,
    );

    const rows = await testDb.db.transaction(
      async () => (await testDb.db.queryInUnitOfWork('SELECT 1 AS one')).rows,
    );
    expect(rows).toEqual([{ one: 1 }]);
  });

  it('refuses queryOutsideUnitOfWork inside a transaction, and runs it outside one', async () => {
    await expect(
      testDb.db.transaction(() => testDb.db.queryOutsideUnitOfWork('SELECT 1')),
    ).rejects.toThrow('must not run inside a transaction');

    expect(
      (await testDb.db.queryOutsideUnitOfWork('SELECT 1 AS one')).rows,
    ).toEqual([{ one: 1 }]);
  });

  it('refuses to insert an outbox record outside a unit of work, and stores nothing', async () => {
    // When an outbox record is inserted without a transaction
    const run = insertOutboxRecord(
      testDb.db,
      outboxRecord(1, new Date('2026-10-18T09:00:00.000Z')),
    );

    // Then it is refused and the outbox is empty
    await expect(run).rejects.toThrow(refused);
    expect(await waitingOutbox(testDb.db)).toEqual([]);
  });

  it('refuses a versioned write outside a unit of work, insert and update alike, and stores nothing', async () => {
    const write = (version: number) =>
      writeVersioned(testDb.db, {
        table: 'versioned_things',
        key: { id: THING },
        values: { label: 'thing' },
        version,
      });

    await expect(write(0)).rejects.toThrow(refused);
    await expect(write(3)).rejects.toThrow(refused);
    expect(await storedThings()).toEqual([]);
  });

  it('refuses to save an aggregate outside a unit of work: nothing stored, its version and events untouched', async () => {
    // Given an aggregate that recorded an event
    const uow = unitOfWork();
    const repository = new PgVersionedThingRepository(testDb.db, uow);
    const thing = VersionedThing.create(THING);
    thing.touch(new Date('2026-10-18T09:00:00.000Z'));

    // When it is saved without a unit of work
    await expect(repository.save(thing)).rejects.toThrow(refused);

    // Then nothing was stored, it is still never-stored, and its event is still its own: saving
    // it properly afterwards writes the row and the event together
    expect(await storedThings()).toEqual([]);
    expect(thing.version).toBe(0);
    await uow.run(() => repository.save(thing));
    expect(await storedThings()).toEqual([{ id: THING }]);
    expect((await waitingOutbox(testDb.db)).map((r) => r.aggregateId)).toEqual([
      THING,
    ]);
  });
});
