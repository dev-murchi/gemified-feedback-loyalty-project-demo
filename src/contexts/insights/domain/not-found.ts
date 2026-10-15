import type { DomainError } from '../../../shared-kernel/domain-error.js';

/** Unknown, or another brand's (FR-B2B-08): both are 404, so a resource's existence never leaks. */
export type ResourceNotFound = DomainError<'NOT_FOUND'>;

export const NOT_FOUND: ResourceNotFound = { code: 'NOT_FOUND' };
