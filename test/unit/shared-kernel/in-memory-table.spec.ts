import { InMemoryTable } from '../../../src/shared-kernel/adapters/in-memory-table.js';

interface Row {
  status: string;
  submittedAt: Date;
  attemptTimes: Date[];
}

const row = (): Row => ({
  status: 'analyzing',
  submittedAt: new Date('2026-10-12T09:00:00.000Z'),
  attemptTimes: [new Date('2026-10-12T08:00:00.000Z')],
});

describe('InMemoryTable', () => {
  it('keeps stored state when the saved object is changed afterwards', () => {
    // Given a row that was saved
    const table = new InMemoryTable<string, Row>();
    const saved = row();
    table.set('f-1', saved);

    // When the caller changes the object it saved, including nested values
    saved.status = 'valid';
    saved.submittedAt.setTime(0);
    saved.attemptTimes.push(new Date(0));

    // Then the stored row is unchanged
    expect(table.get('f-1')).toEqual(row());
  });

  it('keeps stored state when a loaded object is changed', () => {
    // Given a stored row
    const table = new InMemoryTable<string, Row>();
    table.set('f-1', row());

    // When the caller changes what it loaded, including nested values
    const loaded = table.get('f-1');
    loaded?.submittedAt.setTime(0);
    loaded?.attemptTimes.pop();
    table.values()[0]?.attemptTimes.push(new Date(0));

    // Then loading again gives the stored row
    expect(table.get('f-1')).toEqual(row());
  });

  it('returns nothing for a key that was never stored', () => {
    // Given an empty table
    const table = new InMemoryTable<string, Row>();

    // When an unknown key is loaded
    const loaded = table.get('missing');

    // Then nothing is returned
    expect(loaded).toBeUndefined();
  });

  it('restores the previous state on rollback', () => {
    // Given a stored row and a snapshot
    const table = new InMemoryTable<string, Row>();
    table.set('f-1', row());
    const restore = table.snapshot();

    // When rows are replaced, added and deleted, then the snapshot is restored
    table.set('f-1', { ...row(), status: 'valid' });
    table.set('f-2', row());
    table.delete('f-1');
    restore();

    // Then the table holds exactly the previous rows
    expect(table.values()).toEqual([row()]);
  });

  it('stores nothing that a caller still holds, so rollback cannot be bypassed', () => {
    // Given a snapshot taken after a row was saved
    const table = new InMemoryTable<string, Row>();
    const saved = row();
    table.set('f-1', saved);
    const restore = table.snapshot();

    // When the caller changes its object and the snapshot is restored
    saved.submittedAt.setTime(0);
    restore();

    // Then the restored row has the saved values
    expect(table.get('f-1')).toEqual(row());
  });
});
