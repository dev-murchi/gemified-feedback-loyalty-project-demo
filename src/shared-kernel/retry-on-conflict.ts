import { ConcurrencyConflictError } from './concurrency-conflict-error.js';

/**
 * ADR-019, docs/07 §5: on a concurrency conflict the use case runs its whole unit of work once
 * more. `attempt` must be the complete `uow.run(...)`, load included, so the retry decides on fresh
 * data. Only ConcurrencyConflictError is retried; a second conflict and every other error are
 * rethrown unchanged.
 */
export async function retryOnConflict<T>(
  attempt: () => Promise<T>,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (error instanceof ConcurrencyConflictError) return attempt();
    throw error;
  }
}
