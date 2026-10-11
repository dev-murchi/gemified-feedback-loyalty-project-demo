import type { BrandId } from '../../../shared-kernel/ids.js';
import type { Brand } from '../../domain/brand/brand.js';

export interface BrandRepository {
  findById(id: BrandId): Promise<Brand | undefined>;
  /** Optimistic lock (ADR-019, docs/07 §4): throws ConcurrencyConflictError on a stale version. Inside a unit of work. */
  save(brand: Brand): Promise<void>;
}
