import {
  writeVersioned,
  type SqlRunner,
} from '../../../src/platform/postgres/versioned-write.js';

/** A runner that must never be reached: the name check comes first. */
const untouched: SqlRunner = {
  queryInUnitOfWork: () =>
    Promise.reject(new Error('the database was reached')),
};

describe('writeVersioned names', () => {
  const write = (
    overrides: Partial<Parameters<typeof writeVersioned>[1]>,
  ): Promise<number> =>
    writeVersioned(untouched, {
      table: 'wallets',
      key: { user_id: 'u1' },
      values: { xp: 10 },
      version: 0,
      ...overrides,
    });

  it.each([
    ['table', { table: 'wallets; DROP TABLE users' }],
    ['table', { table: 'Wallets' }],
    ['key column', { key: { 'user_id" = 1 --': 'u1' } }],
    ['value column', { values: { 'xp = 0, "version': 1 } }],
  ])(
    'refuses an unsafe %s name before touching the database (insert)',
    async (_kind, overrides) => {
      await expect(write(overrides)).rejects.toThrow(
        'not a plain lower-case SQL identifier',
      );
      await expect(write({ ...overrides, version: 4 })).rejects.toThrow(
        'not a plain lower-case SQL identifier',
      );
    },
  );
});
