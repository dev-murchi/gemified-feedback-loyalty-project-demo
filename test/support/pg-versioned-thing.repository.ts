import type { PgDatabase } from '../../src/platform/postgres/pg-database.js';
import { saveVersioned } from '../../src/platform/postgres/save-versioned.js';
import type { EventCollector } from '../../src/shared-kernel/unit-of-work.js';
import { VersionedThing } from './versioned-thing.js';

export const VERSIONED_THINGS_TABLE = `
  CREATE TABLE versioned_things (
    id uuid PRIMARY KEY,
    label text NOT NULL,
    version integer NOT NULL
  )`;

interface ThingRow {
  readonly id: string;
  readonly label: string;
  readonly version: number;
}

/** A repository the way the real ones are written: rows in, the shared save step out. */
export class PgVersionedThingRepository {
  constructor(
    private readonly db: PgDatabase,
    private readonly events: EventCollector,
  ) {}

  async find(id: string): Promise<VersionedThing | undefined> {
    const { rows } = await this.db.query<ThingRow>(
      'SELECT id, label, version FROM versioned_things WHERE id = $1',
      [id],
    );
    const row = rows[0];
    return row && VersionedThing.reconstitute(row.id, row.label, row.version);
  }

  save(thing: VersionedThing): Promise<void> {
    return saveVersioned({ db: this.db, events: this.events }, thing, {
      table: 'versioned_things',
      key: { id: thing.id },
      values: { label: thing.label },
    });
  }
}
