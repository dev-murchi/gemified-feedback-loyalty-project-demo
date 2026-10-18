import { ConcurrencyConflictError } from '../../shared-kernel/concurrency-conflict-error.js';
import type { Logger } from '../../shared-kernel/logger.js';

/** PostgreSQL's error code for unique_violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * The only two unique constraints that mean "someone was faster" (docs/07 §6): a second reward for
 * the same ledger key, and the same device key registered twice at once (FR-AUTH-02). Matched by
 * name, so a renamed constraint fails its test instead of silently becoming an infrastructure
 * error. Every other unique violation (a QR token, G-3, a duplicate Idempotency-Key) is an error
 * and is never retried.
 */
export const CONFLICT_CONSTRAINTS: ReadonlySet<string> = new Set([
  'ledger_entries_idempotency_key_uq',
  'device_keys_key_identifier_uq',
]);

export interface ConflictContext {
  readonly logger: Logger;
  /** The aggregate being saved, for the conflict error. */
  readonly aggregateId: string;
  /** The key in question (a ledger key, a device key id), never personal data or feedback text. */
  readonly key: string;
}

function constraintOfUniqueViolation(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, constraint } = error as {
    code?: unknown;
    constraint?: unknown;
  };
  return code === UNIQUE_VIOLATION && typeof constraint === 'string'
    ? constraint
    : undefined;
}

/**
 * Runs a statement that may hit a unique constraint. A violation of one of CONFLICT_CONSTRAINTS
 * becomes ConcurrencyConflictError and a warning with the constraint name and the key; the unit of
 * work rolls back and `retryOnConflict` runs it once more. Every other error, unique violations of
 * other constraints included, is rethrown unchanged.
 */
export async function conflictOnUniqueViolation<T>(
  work: () => Promise<T>,
  context: ConflictContext,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const constraint = constraintOfUniqueViolation(error);
    if (constraint === undefined || !CONFLICT_CONSTRAINTS.has(constraint))
      throw error;
    context.logger.warn('Unique constraint hit; retrying the unit of work', {
      constraint,
      key: context.key,
    });
    throw new ConcurrencyConflictError(context.aggregateId);
  }
}
