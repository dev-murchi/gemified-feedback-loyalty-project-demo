import {
  MemoryAuditLog,
  type AuditRow,
} from '../../../src/contexts/insights/adapters/outbound/memory-audit-log.js';
import { RecordB2bAccess } from '../../../src/contexts/insights/application/use-cases/record-b2b-access.js';
import { InMemoryTable } from '../../../src/shared-kernel/adapters/in-memory-table.js';
import { FakeClock } from '../../support/fake-clock.js';
import { NOW } from '../../support/insights-builders.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

describe('RecordB2bAccess (FR-B2B-09)', () => {
  let table: InMemoryTable<string, AuditRow>;
  let record: RecordB2bAccess;

  beforeEach(() => {
    table = new InMemoryTable();
    record = new RecordB2bAccess({
      audit: new MemoryAuditLog(table),
      clock: new FakeClock(NOW),
      ids: new SequentialIdGenerator(),
    });
  });

  it('writes the client, the endpoint, the record count and the time', async () => {
    await record.execute({
      clientId: 'fuel-panel',
      endpoint: 'GET /v1/b2b/feedbacks',
      recordCount: 3,
    });

    expect(table.values()).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        clientId: 'fuel-panel',
        endpoint: 'GET /v1/b2b/feedbacks',
        recordCount: 3,
        at: NOW,
      },
    ]);
  });

  it('only appends: an entry with an existing id is refused, never overwritten', async () => {
    const audit = new MemoryAuditLog(table);
    const entry = {
      id: 'e1',
      clientId: 'c',
      endpoint: 'GET /x',
      recordCount: 1,
      at: NOW,
    };
    await audit.record(entry);

    await expect(audit.record({ ...entry, recordCount: 0 })).rejects.toThrow(
      'already exists',
    );
    expect(table.get('e1')?.recordCount).toBe(1);
  });

  it('never stores a negative or fractional count', async () => {
    await record.execute({
      clientId: 'c',
      endpoint: 'GET /x',
      recordCount: -2.5,
    });

    expect(table.values()[0]?.recordCount).toBe(0);
  });
});
