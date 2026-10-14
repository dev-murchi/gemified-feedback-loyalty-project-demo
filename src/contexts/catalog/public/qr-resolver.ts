import type { DomainError } from '../../../shared-kernel/domain-error.js';
import type { BranchId, BrandId } from '../../../shared-kernel/ids.js';
import type { Result } from '../../../shared-kernel/result.js';
import type { CatalogSector } from './catalog-sector.js';

export interface ResolvedQr {
  /** The scanned QR code (FEEDBACKS.qr_code_id), so a feedback records which code was used. */
  readonly qrCodeId: string;
  readonly branchId: BranchId;
  readonly brandId: BrandId;
  readonly sector: CatalogSector;
}

export type QrInvalidError = DomainError<'QR_INVALID'>;

/**
 * Open host service (docs/06 §3, §5.2): resolves a QR token to its branch, brand and sector.
 * Unknown, revoked or malformed tokens give QR_INVALID (FR-QR-02). This is also the extension
 * point for the signed, single-use dynamic QR of the next phase (FR-QR-08).
 */
export interface QrResolver {
  resolve(token: string): Promise<Result<ResolvedQr, QrInvalidError>>;
}
