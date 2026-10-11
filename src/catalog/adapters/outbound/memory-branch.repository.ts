import type { InMemoryTable } from '../../../shared-kernel/adapters/in-memory-table.js';
import { saveVersioned } from '../../../shared-kernel/adapters/save-versioned.js';
import type { BranchId, BrandId } from '../../../shared-kernel/ids.js';
import type { EventCollector } from '../../../shared-kernel/unit-of-work.js';
import type { BranchRepository } from '../../application/ports/branch-repository.js';
import { Branch } from '../../domain/branch/branch.js';
import type {
  QrCode,
  QrCodeId,
  QrCodeStatus,
} from '../../domain/branch/qr-code.js';
import type { QrToken } from '../../domain/branch/qr-token.js';

/** Plain stored QR code; mirrors the QR_CODES table (SDD 6.1). */
export interface QrCodeRow {
  readonly id: string;
  readonly token: string;
  readonly status: QrCodeStatus;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

/** Plain stored branch with its QR codes; mirrors BRANCHES + QR_CODES (SDD 6.1). */
export interface BranchRow {
  readonly id: string;
  readonly brandId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly qrCodes: readonly QrCodeRow[];
  readonly version: number;
}

export interface MemoryBranchRepositoryDeps {
  readonly table: InMemoryTable<string, BranchRow>;
  readonly events: EventCollector;
}

const toQrCode = (row: QrCodeRow): QrCode => ({
  ...row,
  id: row.id as QrCodeId,
  token: row.token as QrToken,
});

const toBranch = (row: BranchRow): Branch =>
  Branch.reconstitute(
    {
      id: row.id as BranchId,
      brandId: row.brandId as BrandId,
      name: row.name,
      location: { lat: row.lat, lng: row.lng },
      qrCodes: row.qrCodes.map(toQrCode),
    },
    row.version,
  );

const toRow = (branch: Branch, version: number): BranchRow => ({
  id: branch.id,
  brandId: branch.brandId,
  name: branch.name,
  lat: branch.location.lat,
  lng: branch.location.lng,
  qrCodes: branch.qrCodes.map((code) => ({ ...code })),
  version,
});

export class MemoryBranchRepository implements BranchRepository {
  constructor(private readonly deps: MemoryBranchRepositoryDeps) {}

  findById(id: BranchId): Promise<Branch | undefined> {
    const row = this.deps.table.get(id);
    return Promise.resolve(row === undefined ? undefined : toBranch(row));
  }

  findByQrToken(token: QrToken): Promise<Branch | undefined> {
    const row = this.deps.table
      .values()
      .find((candidate) =>
        candidate.qrCodes.some((code) => code.token === token),
      );
    return Promise.resolve(row === undefined ? undefined : toBranch(row));
  }

  save(branch: Branch): Promise<void> {
    if (this.#tokenTakenByAnotherBranch(branch)) {
      return Promise.reject(
        new Error(
          'A QR token of this branch already belongs to another branch',
        ),
      );
    }
    return saveVersioned(this.deps, branch, {
      key: branch.id,
      toRow: (version) => toRow(branch, version),
    });
  }

  /** Emulates the unique constraint on QR_CODES.token (G-3). */
  #tokenTakenByAnotherBranch(branch: Branch): boolean {
    const tokens = new Set<string>(branch.qrCodes.map((code) => code.token));
    return this.deps.table
      .values()
      .some(
        (row) =>
          row.id !== branch.id &&
          row.qrCodes.some((code) => tokens.has(code.token)),
      );
  }
}
