import { BranchId, BrandId } from '../../../../../shared-kernel/ids.js';
import type { UnitOfWork } from '../../../../../shared-kernel/unit-of-work.js';
import type { BranchRepository } from '../../../application/ports/branch-repository.js';
import type { BrandRepository } from '../../../application/ports/brand-repository.js';
import type { LabelSetRepository } from '../../../application/ports/label-set-repository.js';
import { Branch } from '../../../domain/branch/branch.js';
import { QrCodeId, type QrCode } from '../../../domain/branch/qr-code.js';
import { QrToken } from '../../../domain/branch/qr-token.js';
import { Brand } from '../../../domain/brand/brand.js';
import { GeoPoint } from '../../../domain/geo-point.js';
import { LabelSet } from '../../../domain/label-set/label-set.js';
import {
  demoCatalogDefinition,
  type DemoBranch,
  type DemoCatalogDefinition,
} from './demo-catalog.definition.js';
import { demoCatalogSnapshot } from './demo-catalog.snapshot.js';
import {
  assertNoOrphans,
  valueOrThrow,
  type DemoCatalogSnapshot,
  type DemoQrCodeSnapshot,
} from './demo-snapshot.js';

export interface DemoCatalogTargets {
  readonly brands: BrandRepository;
  readonly branches: BranchRepository;
  readonly labelSets: LabelSetRepository;
  readonly uow: UnitOfWork;
}

export interface DemoCatalogData {
  readonly definition: DemoCatalogDefinition;
  readonly snapshot: DemoCatalogSnapshot;
}

const DEMO_DATA: DemoCatalogData = {
  definition: demoCatalogDefinition,
  snapshot: demoCatalogSnapshot,
};

/**
 * Loads the demo catalog in one unit of work. Brands and label sets go through `create`; branches
 * are restored from the snapshot (already issued QR codes, version 0), so no token is made up here.
 * The snapshot is a file in git, so every id and token is validated, and entries without a
 * definition are refused. Loading twice throws ConcurrencyConflictError (open item for S0-11).
 */
export async function loadDemoCatalog(
  targets: DemoCatalogTargets,
  data: DemoCatalogData = DEMO_DATA,
): Promise<void> {
  const { definition, snapshot } = data;
  assertNoOrphans(definition, snapshot);
  await targets.uow.run(async () => {
    for (const brand of definition.brands) {
      const id = valueOrThrow(
        BrandId.create(entry(snapshot.brands, brand.key).id),
        brand.key,
      );
      const created = Brand.create({
        id,
        name: brand.name,
        sector: brand.sector,
      });
      await targets.brands.save(valueOrThrow(created, brand.key));
    }
    for (const branch of definition.branches) {
      await targets.branches.save(restoreBranch(branch, snapshot));
    }
    for (const labelSet of definition.labelSets) {
      await targets.labelSets.save(
        valueOrThrow(LabelSet.create(labelSet), labelSet.sector),
      );
    }
  });
}

function entry<T>(entries: Readonly<Record<string, T>>, key: string): T {
  const found = entries[key];
  if (found === undefined) {
    throw new Error(
      `Demo snapshot has no entry for "${key}"; run npm run demo:snapshot`,
    );
  }
  return found;
}

function restoreBranch(
  definition: DemoBranch,
  snapshot: DemoCatalogSnapshot,
): Branch {
  const stored = entry(snapshot.branches, definition.key);
  const brandId = entry(snapshot.brands, definition.brandKey).id;
  return Branch.reconstitute(
    {
      id: valueOrThrow(BranchId.create(stored.id), definition.key),
      brandId: valueOrThrow(BrandId.create(brandId), definition.brandKey),
      name: definition.name,
      location: valueOrThrow(
        GeoPoint.create(definition.lat, definition.lng),
        definition.key,
      ),
      qrCodes: stored.qrCodes.map(restoreQrCode),
    },
    0,
  );
}

const restoreQrCode = (code: DemoQrCodeSnapshot): QrCode => ({
  id: valueOrThrow(QrCodeId.create(code.id), code.id),
  token: valueOrThrow(QrToken.parse(code.token), code.id),
  status: 'active',
  createdAt: new Date(code.createdAt),
  revokedAt: null,
});
