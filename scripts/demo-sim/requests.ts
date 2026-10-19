import { randomUUID } from 'node:crypto';
import type { FakeDevice } from '../../test/support/fake-device.js';

export interface FeedbackProof {
  /** Header `Idempotency-Key`: the one the caller gave, or a new UUID. */
  readonly idempotencyKey: string;
  /** Header `X-Platform-Proof`: a signature over SHA-256(Idempotency-Key ‖ the body's bytes). */
  readonly xPlatformProof: string;
}

/**
 * Signs the body of POST /v1/feedbacks exactly as it was given, byte for byte. The backend hashes
 * the raw bytes it receives, so the caller must send those same bytes.
 */
export function feedbackProof(
  phone: FakeDevice,
  body: Buffer,
  idempotencyKey: string | undefined,
): FeedbackProof {
  const key = idempotencyKey ?? randomUUID();
  return { idempotencyKey: key, xPlatformProof: phone.requestProof(key, body) };
}
