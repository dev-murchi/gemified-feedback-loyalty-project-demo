// Runs the UnitOfWork contract against PostgreSQL. Rows live in a test-only table of this file's
// own database; the outbox is the real migrated table.

import { fixedRoutes } from '../../../src/shared-kernel/event-routing.js';
import { PgUnitOfWork } from '../../../src/platform/postgres/pg-unit-of-work.js';
import {
  unitOfWorkContract,
  type RowWriter,
  type Table,
  type UnitOfWorkSetup,
} from '../../contract/support/unit-of-work.contract.js';
import { waitingOutbox } from '../../support/pg-outbox-rows.js';
import {
  emptyTables,
  freshDatabase,
  type TestDatabase,
} from '../../support/postgres.js';

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await freshDatabase();
  await testDb.db.query(
    `CREATE TABLE uow_rows (
       tbl text NOT NULL, key text NOT NULL, value text NOT NULL, PRIMARY KEY (tbl, key))`,
  );
});

afterAll(() => testDb.drop());

async function pgHarness(setup: UnitOfWorkSetup) {
  const { db } = testDb;
  await emptyTables(db);
  const writer: RowWriter = {
    put: async (table, key, value) => {
      await db.query(
        `INSERT INTO uow_rows (tbl, key, value) VALUES ($1, $2, $3)
         ON CONFLICT (tbl, key) DO UPDATE SET value = EXCLUDED.value`,
        [table, key, value],
      );
    },
    remove: async (table, key) => {
      await db.query('DELETE FROM uow_rows WHERE tbl = $1 AND key = $2', [
        table,
        key,
      ]);
    },
  };
  const uow: PgUnitOfWork = new PgUnitOfWork({
    db,
    routes: fixedRoutes(
      setup.routes({ ...writer, collect: (events) => uow.collect(events) }),
    ),
    clock: setup.clock,
    ids: setup.ids,
  });
  return {
    ...writer,
    uow,
    rows: async (table: Table) =>
      (
        await db.query<{ value: string }>(
          'SELECT value FROM uow_rows WHERE tbl = $1 ORDER BY value',
          [table],
        )
      ).rows.map((row) => row.value),
    outbox: () => waitingOutbox(db),
  };
}

describe('UnitOfWork (PostgreSQL)', () => {
  unitOfWorkContract(pgHarness);
});
