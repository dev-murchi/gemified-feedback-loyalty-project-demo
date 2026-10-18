import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** One SQL file of `db/migrations/`, e.g. `0001_outbox.sql`. */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
  /** SHA-256 of the file, so a migration changed after it was applied is noticed. */
  readonly checksum: string;
}

/** A row of `schema_migrations`. */
export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
}

const FILE_NAME = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export function migrationOf(fileName: string, sql: string): Migration {
  const match = FILE_NAME.exec(fileName);
  if (match?.[1] === undefined || match[2] === undefined)
    throw new Error(
      `Migration file "${fileName}" is not named NNNN_lower_snake_case.sql`,
    );
  return {
    version: Number(match[1]),
    name: match[2],
    sql,
    checksum: createHash('sha256').update(sql).digest('hex'),
  };
}

/** Sorted by version; two files with the same version are refused. */
export function inVersionOrder(migrations: readonly Migration[]): Migration[] {
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  sorted.forEach((migration, index) => {
    if (sorted[index - 1]?.version === migration.version)
      throw new Error(`Two migrations have version ${migration.version}`);
  });
  return sorted;
}

/** Every `.sql` file of the directory as a migration, in version order. */
export async function readMigrations(directory: string): Promise<Migration[]> {
  const files = (await readdir(directory)).filter((file) =>
    file.endsWith('.sql'),
  );
  const migrations = await Promise.all(
    files.map(async (file) =>
      migrationOf(file, await readFile(join(directory, file), 'utf8')),
    ),
  );
  return inVersionOrder(migrations);
}

function checkApplied(
  byVersion: ReadonlyMap<number, Migration>,
  applied: AppliedMigration,
): void {
  const migration = byVersion.get(applied.version);
  if (migration === undefined)
    throw new Error(
      `Migration ${applied.version} (${applied.name}) is applied but this build does not have it`,
    );
  if (migration.checksum !== applied.checksum)
    throw new Error(
      `Migration ${applied.version} (${applied.name}) was changed after it was applied`,
    );
}

/**
 * The migrations still to apply, in order. Applied migrations are never edited (write a new one);
 * a database ahead of this build, or a new migration older than an applied one, is refused, so a
 * database is never migrated into a state no single build describes.
 */
export function pendingMigrations(
  available: readonly Migration[],
  applied: readonly AppliedMigration[],
): Migration[] {
  const byVersion = new Map(available.map((m) => [m.version, m]));
  applied.forEach((row) => checkApplied(byVersion, row));
  const latest = Math.max(0, ...applied.map((row) => row.version));
  const pending = available.filter((m) => m.version > latest);
  const skipped = available.find(
    (m) =>
      m.version < latest && !applied.some((row) => row.version === m.version),
  );
  if (skipped !== undefined)
    throw new Error(
      `Migration ${skipped.version} (${skipped.name}) is older than applied migration ${latest}`,
    );
  return pending;
}
