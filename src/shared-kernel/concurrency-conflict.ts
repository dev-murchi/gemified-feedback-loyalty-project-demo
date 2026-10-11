import type { DomainError } from './domain-error.js';

/**
 * Returned by a repository when the stored version differs from the loaded one (optimistic
 * locking, ADR-019). The use case reloads and retries once; it never reaches the API as such.
 */
export interface ConcurrencyConflict extends DomainError<'CONCURRENCY_CONFLICT'> {
  readonly aggregateId: string;
}

export const concurrencyConflict = (
  aggregateId: string,
): ConcurrencyConflict => ({
  code: 'CONCURRENCY_CONFLICT',
  aggregateId,
});
