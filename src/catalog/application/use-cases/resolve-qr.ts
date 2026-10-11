import { err, ok, type Result } from '../../../shared-kernel/result.js';
import { QrToken } from '../../domain/branch/qr-token.js';
import type {
  QrInvalidError,
  QrResolver,
  ResolvedQr,
} from '../../public/qr-resolver.js';
import type { BranchRepository } from '../ports/branch-repository.js';
import type { BrandRepository } from '../ports/brand-repository.js';

export interface ResolveQrDeps {
  readonly branches: BranchRepository;
  readonly brands: BrandRepository;
}

const QR_INVALID: QrInvalidError = { code: 'QR_INVALID' };

/** Implements the QrResolver open host service (FR-QR-01, FR-QR-02). Read-only. */
export class ResolveQr implements QrResolver {
  constructor(private readonly deps: ResolveQrDeps) {}

  async resolve(rawToken: string): Promise<Result<ResolvedQr, QrInvalidError>> {
    const token = QrToken.parse(rawToken);
    if (!token.ok) return token;
    const branch = await this.deps.branches.findByQrToken(token.value);
    if (branch === undefined || !branch.accepts(token.value))
      return err(QR_INVALID);
    const brand = await this.deps.brands.findById(branch.brandId);
    if (brand === undefined) {
      throw new Error(
        `Brand ${branch.brandId} of branch ${branch.id} is missing`,
      );
    }
    return ok({ branchId: branch.id, brandId: brand.id, sector: brand.sector });
  }
}
