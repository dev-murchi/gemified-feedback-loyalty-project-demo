/**
 * Thrown by a repository when the stored version differs from the loaded one (optimistic locking,
 * ADR-019). Throwing rolls back the whole unit of work; the use case retries it once with
 * `retryOnConflict`. It is not a DomainError and never appears in a Result (docs/07 §5–6): a second
 * conflict reaches the API as INTERNAL_ERROR (500, retryable).
 */
export class ConcurrencyConflictError extends Error {
  constructor(readonly aggregateId: string) {
    super(`Concurrency conflict on aggregate ${aggregateId}`);
    this.name = 'ConcurrencyConflictError';
  }
}
