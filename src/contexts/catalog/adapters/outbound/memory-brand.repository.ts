import type { InMemoryTable } from '../../../../shared-kernel/adapters/in-memory-table.js';
import { saveVersioned } from '../../../../shared-kernel/adapters/save-versioned.js';
import type { BrandId } from '../../../../shared-kernel/ids.js';
import type { EventCollector } from '../../../../shared-kernel/unit-of-work.js';
import type { BrandRepository } from '../../application/ports/brand-repository.js';
import { Brand } from '../../domain/brand/brand.js';
import type { Sector } from '../../domain/sector.js';

/** Plain stored row; mirrors the BRANDS table (SDD 6.1). */
export interface BrandRow {
  readonly id: string;
  readonly name: string;
  readonly sector: Sector;
  readonly version: number;
}

export interface MemoryBrandRepositoryDeps {
  readonly table: InMemoryTable<string, BrandRow>;
  readonly events: EventCollector;
}

const toBrand = (row: BrandRow): Brand =>
  Brand.reconstitute(
    { id: row.id as BrandId, name: row.name, sector: row.sector },
    row.version,
  );

export class MemoryBrandRepository implements BrandRepository {
  constructor(private readonly deps: MemoryBrandRepositoryDeps) {}

  findById(id: BrandId): Promise<Brand | undefined> {
    const row = this.deps.table.get(id);
    return Promise.resolve(row === undefined ? undefined : toBrand(row));
  }

  save(brand: Brand): Promise<void> {
    return saveVersioned(this.deps, brand, {
      key: brand.id,
      toRow: (version) => ({
        id: brand.id,
        name: brand.name,
        sector: brand.sector,
        version,
      }),
    });
  }
}
