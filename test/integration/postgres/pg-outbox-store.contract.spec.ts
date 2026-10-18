// Runs the OutboxStore contract against PostgreSQL's OUTBOX table (SDD 6.1).

import { waitingOutbox } from '../../support/pg-outbox-rows.js';
import { PgOutboxStore } from '../../../src/platform/postgres/pg-outbox-store.js';
import { insertOutboxRecord } from '../../../src/platform/postgres/pg-outbox-store.js';
import { outboxStoreContract } from '../../contract/support/outbox-store.contract.js';
import {
  emptyTables,
  freshDatabase,
  type TestDatabase,
} from '../../support/postgres.js';

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await freshDatabase();
});

afterAll(() => testDb.drop());

describe('OutboxStore (PostgreSQL)', () => {
  outboxStoreContract(async () => {
    const { db } = testDb;
    await emptyTables(db);
    return {
      outbox: new PgOutboxStore(db),
      add: (record) => db.transaction(() => insertOutboxRecord(db, record)),
      waiting: () => waitingOutbox(db),
      dispose: () => Promise.resolve(),
    };
  });
});
