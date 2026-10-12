import type { BranchId } from '../../../../shared-kernel/ids.js';
import type { Branch } from '../../domain/branch/branch.js';
import type { QrToken } from '../../domain/branch/qr-token.js';

export interface BranchRepository {
  findById(id: BranchId): Promise<Branch | undefined>;
  /** Finds the branch that owns the token, whether the code is active or revoked. */
  findByQrToken(token: QrToken): Promise<Branch | undefined>;
  /**
   * Optimistic lock (ADR-019, docs/07 §4): throws ConcurrencyConflictError on a stale version.
   * Inside a unit of work. A token that already belongs to another branch is a storage error and
   * throws too (unique constraint, G-3).
   */
  save(branch: Branch): Promise<void>;
}
