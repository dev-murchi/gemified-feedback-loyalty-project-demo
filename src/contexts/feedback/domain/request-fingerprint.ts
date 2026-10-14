import type { DomainError } from '../../../shared-kernel/domain-error.js';
import type { Branded } from '../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../shared-kernel/result.js';

/**
 * What a request was, as a SHA-256 in lower-case hex (FR-AI-10): the same Idempotency-Key with a
 * different fingerprint is IDEMPOTENCY_KEY_MISMATCH. The hash is computed by the use case; the
 * comment itself is never stored here.
 */
export type RequestFingerprint = Branded<string, 'RequestFingerprint'>;

export type InvalidFingerprint = DomainError<'VALIDATION_ERROR'>;

export const RequestFingerprint = {
  parse(raw: string): Result<RequestFingerprint, InvalidFingerprint> {
    return /^[0-9a-f]{64}$/.test(raw)
      ? ok(raw as RequestFingerprint)
      : err({ code: 'VALIDATION_ERROR' });
  },
};
