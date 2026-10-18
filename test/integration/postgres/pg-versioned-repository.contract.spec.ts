// Runs the optimistic-locking contract (ADR-019) against PostgreSQL, through the shared save step
// every PostgreSQL repository uses.

import { fixedRoutes } from '../../../src/shared-kernel/event-routing.js';
import { PgUnitOfWork } from '../../../src/platform/postgres/pg-unit-of-work.js';
import { versionedRepositoryContract } from '../../contract/support/versioned-repository.contract.js';
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

const THING = '00000000-0000-4000-8000-0000000000e1';

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await freshDatabase();
  await testDb.db.query(VERSIONED_THINGS_TABLE);
});

afterAll(() => testDb.drop());

describe('versioned repository (PostgreSQL)', () => {
  versionedRepositoryContract<VersionedThing>(async () => {
    const { db } = testDb;
    await emptyTables(db);
    const uow: PgUnitOfWork = new PgUnitOfWork({
      db,
      routes: fixedRoutes({}),
      clock: new FakeClock(),
      ids: new SequentialIdGenerator(),
    });
    const repository = new PgVersionedThingRepository(db, uow);
    return {
      uow,
      newAggregate: () => VersionedThing.create(THING),
      save: (thing) => repository.save(thing),
      load: () => repository.find(THING),
      dispose: () => Promise.resolve(),
    };
  });
});
