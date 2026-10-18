import { ConcurrencyConflictError } from '../../shared-kernel/concurrency-conflict-error.js';
import type { PgDatabase } from './pg-database.js';

/** The part of PgDatabase a versioned write needs; unit tests give it a fake. */
export type SqlRunner = Pick<PgDatabase, 'queryInUnitOfWork'>;

export interface VersionedRowWrite {
  readonly table: string;
  /** The primary key columns and their values; they are the conflict target of an insert. */
  readonly key: Readonly<Record<string, unknown>>;
  /** Every other column to write, `version` excluded. */
  readonly values: Readonly<Record<string, unknown>>;
  /** The stored version the aggregate is based on (ADR-019); 0 means never stored. */
  readonly version: number;
}

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

/**
 * Table and column names come from repository code, never from input; this keeps it so. The names
 * are written into the statement, only the values are parameters.
 */
function quoted(identifier: string): string {
  if (!IDENTIFIER.test(identifier))
    throw new Error(`"${identifier}" is not a plain lower-case SQL identifier`);
  return `"${identifier}"`;
}

const placeholders = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `$${from + index}`);

/**
 * Version 0, a never-stored aggregate: an insert at version 1. `ON CONFLICT (primary key) DO
 * NOTHING` makes an existing row, or one a concurrent request is just inserting (PostgreSQL waits
 * for its commit), zero inserted rows. Any other unique constraint still raises its own violation.
 */
async function insertNew(db: SqlRunner, write: VersionedRowWrite) {
  const columns = [
    ...Object.keys(write.key),
    ...Object.keys(write.values),
    'version',
  ];
  const values = [
    ...Object.values(write.key),
    ...Object.values(write.values),
    1,
  ];
  const result = await db.queryInUnitOfWork(
    `INSERT INTO ${quoted(write.table)} (${columns.map(quoted).join(', ')})
     VALUES (${placeholders(1, values.length).join(', ')})
     ON CONFLICT (${Object.keys(write.key).map(quoted).join(', ')}) DO NOTHING`,
    values,
  );
  return result.rowCount ?? 0;
}

/** A stored aggregate: the update matches the loaded version, so a changed row matches nothing. */
async function updateExisting(db: SqlRunner, write: VersionedRowWrite) {
  const values = Object.values(write.values);
  const assignments = Object.keys(write.values).map(
    (column, index) => `${quoted(column)} = $${index + 1}`,
  );
  const keyColumns = Object.keys(write.key);
  const conditions = keyColumns.map(
    (column, index) => `${quoted(column)} = $${values.length + index + 1}`,
  );
  const versionPlace = values.length + keyColumns.length + 1;
  const result = await db.queryInUnitOfWork(
    `UPDATE ${quoted(write.table)}
     SET ${[...assignments, `"version" = "version" + 1`].join(', ')}
     WHERE ${[...conditions, `"version" = $${versionPlace}`].join(' AND ')}`,
    [...values, ...Object.values(write.key), write.version],
  );
  return result.rowCount ?? 0;
}

/**
 * The optimistic lock of every PostgreSQL repository (ADR-019, G-2; docs/07 §4). Returns the
 * version now stored. A row that is not at the loaded version, or an insert for an identity that
 * exists, writes nothing and throws ConcurrencyConflictError, which rolls back the unit of work.
 * Business rules never appear here: it only compares versions. It writes only inside a unit of work:
 * outside one the database refuses it and nothing is stored (PgDatabase.queryInUnitOfWork).
 */
export async function writeVersioned(
  db: SqlRunner,
  write: VersionedRowWrite,
): Promise<number> {
  const changed =
    write.version === 0
      ? await insertNew(db, write)
      : await updateExisting(db, write);
  if (changed !== 1)
    throw new ConcurrencyConflictError(Object.values(write.key).join(':'));
  return write.version + 1;
}
