import type { DomainError } from '../../../shared-kernel/domain-error.js';
import type { Branded } from '../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../shared-kernel/result.js';

/** The client's key for one feedback (FR-AI-10): a UUID, compared in lower case. */
export type IdempotencyKey = Branded<string, 'IdempotencyKey'>;

export interface InvalidIdempotencyKey extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'Idempotency-Key';
}

/** `Idempotency-Key` in docs/api/openapi.yaml is `format: uuid`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const IdempotencyKey = {
  parse(raw: string): Result<IdempotencyKey, InvalidIdempotencyKey> {
    return UUID.test(raw)
      ? ok(raw.toLowerCase() as IdempotencyKey)
      : err({ code: 'VALIDATION_ERROR', field: 'Idempotency-Key' });
  },
};
