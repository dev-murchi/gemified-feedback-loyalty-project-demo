import type { BranchRepository } from '../../src/catalog/application/ports/branch-repository.js';
import type { Branch } from '../../src/catalog/domain/branch/branch.js';
import type { QrToken } from '../../src/catalog/domain/branch/qr-token.js';
import { ConcurrencyConflictError } from '../../src/shared-kernel/concurrency-conflict-error.js';
import type { BranchId } from '../../src/shared-kernel/ids.js';

/**
 * A BranchRepository fake that throws ConcurrencyConflictError on its first `conflicts` saves,
 * as if another request had saved in between, and otherwise delegates to a real repository.
 * Counts loads so a test can see that a retry reloaded.
 */
export class ConflictingBranchRepository implements BranchRepository {
  loads = 0;
  #conflictsLeft: number;

  constructor(
    private readonly inner: BranchRepository,
    conflicts: number,
  ) {
    this.#conflictsLeft = conflicts;
  }

  findById(id: BranchId): Promise<Branch | undefined> {
    this.loads += 1;
    return this.inner.findById(id);
  }

  findByQrToken(token: QrToken): Promise<Branch | undefined> {
    this.loads += 1;
    return this.inner.findByQrToken(token);
  }

  save(branch: Branch): Promise<void> {
    if (this.#conflictsLeft === 0) return this.inner.save(branch);
    this.#conflictsLeft -= 1;
    return Promise.reject(new ConcurrencyConflictError(branch.id));
  }
}
