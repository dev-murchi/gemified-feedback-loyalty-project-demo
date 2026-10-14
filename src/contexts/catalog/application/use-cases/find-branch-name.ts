import type { BranchId } from '../../../../shared-kernel/ids.js';
import type { BranchDirectory } from '../../public/branch-directory.js';
import type { BranchRepository } from '../ports/branch-repository.js';

export interface FindBranchNameDeps {
  readonly branches: BranchRepository;
}

/** Implements the BranchDirectory open host service. Read-only. */
export class FindBranchName implements BranchDirectory {
  constructor(private readonly deps: FindBranchNameDeps) {}

  async nameOf(branchId: BranchId): Promise<string | undefined> {
    return (await this.deps.branches.findById(branchId))?.name;
  }
}
