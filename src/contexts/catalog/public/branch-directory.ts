import type { BranchId } from '../../../shared-kernel/ids.js';

/**
 * Open host service (docs/06 §3, §5.2): the name of a branch, as the feedback status shows it
 * (GET /v1/feedbacks/{id}). Undefined for an unknown branch. Read-only.
 */
export interface BranchDirectory {
  nameOf(branchId: BranchId): Promise<string | undefined>;
}
