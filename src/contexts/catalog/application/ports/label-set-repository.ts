import type { LabelSet } from '../../domain/label-set/label-set.js';
import type { Sector } from '../../domain/sector.js';

export interface LabelSetRepository {
  /** The label set with the highest version for the sector. */
  findLatest(sector: Sector): Promise<LabelSet | undefined>;
  /** Optimistic lock (ADR-019, docs/07 §4): throws ConcurrencyConflictError on a stale version. Inside a unit of work. */
  save(labelSet: LabelSet): Promise<void>;
}
