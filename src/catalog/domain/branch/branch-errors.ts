import type { DomainError } from '../../../shared-kernel/domain-error.js';

export interface InvalidBranch extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'name';
}

/** The token does not belong to this branch. */
export type QrCodeNotFound = DomainError<'NOT_FOUND'>;
