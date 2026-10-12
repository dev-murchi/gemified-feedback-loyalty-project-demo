// Small builders for Catalog test data. Tests in every context use these, never the demo loader.

import {
  Branch,
  type NewBranch,
  type QrIssuing,
} from '../../src/contexts/catalog/domain/branch/branch.js';
import {
  Brand,
  type BrandState,
} from '../../src/contexts/catalog/domain/brand/brand.js';
import {
  LabelSet,
  type NewLabelSet,
} from '../../src/contexts/catalog/domain/label-set/label-set.js';
import type { DomainError } from '../../src/shared-kernel/domain-error.js';
import type { BranchId, BrandId } from '../../src/shared-kernel/ids.js';
import type { Result } from '../../src/shared-kernel/result.js';
import { FakeClock } from './fake-clock.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';
import { SequentialRandomSource } from './sequential-random-source.js';

export const BRAND_ID = 'b0000000-0000-4000-8000-000000000001' as BrandId;
export const BRANCH_ID = 'c0000000-0000-4000-8000-000000000001' as BranchId;
export const OTHER_BRANCH_ID =
  'c0000000-0000-4000-8000-000000000002' as BranchId;

/** Shared by default so QR tokens never repeat across builders in one test file. */
const defaultIssuing: QrIssuing = {
  random: new SequentialRandomSource(),
  ids: new SequentialIdGenerator(),
  clock: new FakeClock(),
};

const valueOf = <T>(result: Result<T, DomainError>): T => {
  if (!result.ok)
    throw new Error(`Builder produced invalid data: ${result.error.code}`);
  return result.value;
};

export function aBrand(overrides: Partial<BrandState> = {}): Brand {
  return valueOf(
    Brand.create({
      id: BRAND_ID,
      name: 'Örnek Petrol',
      sector: 'fuel',
      ...overrides,
    }),
  );
}

export interface BranchOptions extends Partial<NewBranch> {
  /** Number of active QR codes to issue (default 1). */
  readonly qrCodes?: number;
  readonly issuing?: QrIssuing;
}

export function aBranch(options: BranchOptions = {}): Branch {
  const { qrCodes = 1, issuing = defaultIssuing, ...overrides } = options;
  const branch = valueOf(
    Branch.create({
      id: BRANCH_ID,
      brandId: BRAND_ID,
      name: 'Kadıköy Rıhtım',
      location: { lat: 40.9909, lng: 29.0236 },
      ...overrides,
    }),
  );
  for (let issued = 0; issued < qrCodes; issued += 1)
    branch.issueQrCode(issuing);
  return branch;
}

export function aLabelSet(overrides: Partial<NewLabelSet> = {}): LabelSet {
  return valueOf(
    LabelSet.create({
      sector: 'fuel',
      labelSetVersion: 1,
      topics: [
        { key: 'toilet_cleanliness', name: 'Tuvalet temizliği' },
        { key: 'other', name: 'Diğer' },
      ],
      ...overrides,
    }),
  );
}
