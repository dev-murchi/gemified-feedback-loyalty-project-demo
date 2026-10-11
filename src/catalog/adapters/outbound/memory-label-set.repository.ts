import type { InMemoryTable } from '../../../shared-kernel/adapters/in-memory-table.js';
import { saveVersioned } from '../../../shared-kernel/adapters/save-versioned.js';
import type { EventCollector } from '../../../shared-kernel/unit-of-work.js';
import type { LabelSetRepository } from '../../application/ports/label-set-repository.js';
import { LabelSet } from '../../domain/label-set/label-set.js';
import type { Sector } from '../../domain/sector.js';
import type { TopicKey } from '../../domain/topic-key.js';

/** Plain stored label set; mirrors the TOPICS rows of one sector and version (SDD 6.1). */
export interface LabelSetRow {
  readonly sector: Sector;
  readonly labelSetVersion: number;
  readonly topics: readonly { readonly key: string; readonly name: string }[];
  readonly version: number;
}

export interface MemoryLabelSetRepositoryDeps {
  readonly table: InMemoryTable<string, LabelSetRow>;
  readonly events: EventCollector;
}

const keyOf = (sector: Sector, labelSetVersion: number): string =>
  `${sector}:${labelSetVersion}`;

const toLabelSet = (row: LabelSetRow): LabelSet =>
  LabelSet.reconstitute(
    {
      sector: row.sector,
      labelSetVersion: row.labelSetVersion,
      topics: row.topics.map((topic) => ({
        key: topic.key as TopicKey,
        name: topic.name,
      })),
    },
    row.version,
  );

export class MemoryLabelSetRepository implements LabelSetRepository {
  constructor(private readonly deps: MemoryLabelSetRepositoryDeps) {}

  findLatest(sector: Sector): Promise<LabelSet | undefined> {
    const latest = this.deps.table
      .values()
      .filter((row) => row.sector === sector)
      .sort((a, b) => b.labelSetVersion - a.labelSetVersion)[0];
    return Promise.resolve(
      latest === undefined ? undefined : toLabelSet(latest),
    );
  }

  save(labelSet: LabelSet): Promise<void> {
    return saveVersioned(this.deps, labelSet, {
      key: keyOf(labelSet.sector, labelSet.labelSetVersion),
      toRow: (version) => ({
        sector: labelSet.sector,
        labelSetVersion: labelSet.labelSetVersion,
        topics: labelSet.topics.map((topic) => ({ ...topic })),
        version,
      }),
    });
  }
}
