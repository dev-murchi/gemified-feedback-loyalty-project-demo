// Runs the UnitOfWork contract against the in-memory unit of work; PostgreSQL runs the same
// contract in test/integration/postgres/.

import { InMemoryTable } from '../../../src/shared-kernel/adapters/in-memory-table.js';
import { InMemoryUnitOfWork } from '../../../src/shared-kernel/adapters/in-memory-unit-of-work.js';
import { fixedRoutes } from '../../../src/shared-kernel/event-routing.js';
import type { OutboxRecord } from '../../../src/shared-kernel/outbox-record.js';
import {
  unitOfWorkContract,
  type RowWriter,
  type Table,
  type UnitOfWorkSetup,
} from '../support/unit-of-work.contract.js';

function memoryHarness(setup: UnitOfWorkSetup) {
  const tables: Record<Table, InMemoryTable<string, string>> = {
    users: new InMemoryTable(),
    wallets: new InMemoryTable(),
  };
  const outbox = new InMemoryTable<string, OutboxRecord>();
  const writer: RowWriter = {
    put: (table, key, value) => Promise.resolve(tables[table].set(key, value)),
    remove: (table, key) => Promise.resolve(tables[table].delete(key)),
  };
  const uow: InMemoryUnitOfWork = new InMemoryUnitOfWork({
    routes: fixedRoutes(
      setup.routes({ ...writer, collect: (events) => uow.collect(events) }),
    ),
    tables: Object.values(tables),
    outbox,
    clock: setup.clock,
    ids: setup.ids,
  });
  return Promise.resolve({
    ...writer,
    uow,
    rows: (table: Table) => Promise.resolve(tables[table].values().sort()),
    outbox: () => Promise.resolve(outbox.values()),
  });
}

describe('UnitOfWork (in-memory)', () => {
  unitOfWorkContract(memoryHarness);
});
