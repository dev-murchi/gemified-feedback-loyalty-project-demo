import type { UserId } from '../../../shared-kernel/ids.js';

/** One feedback request as its platform proof covers it (FR-QR-10, SDD 7.2). */
export interface PlatformProofRequest {
  readonly userId: UserId;
  /** The device key of the session (`dk` in the access token). */
  readonly keyIdentifier: string;
  /** The `Idempotency-Key` header as received. */
  readonly idempotencyKey: string;
  /** The request body exactly as received, before any parsing. */
  readonly body: Uint8Array;
  /** The `X-Platform-Proof` header; undefined if the request had none. */
  readonly proof: string | undefined;
}

/**
 * Open host service (docs/06 §5.1): does the request carry a valid platform proof over
 * SHA-256(Idempotency-Key ‖ body), made with the session's device key, and is that key still
 * active? A missing or invalid proof is not an error: the feedback is accepted without a reward.
 */
export interface PlatformProofVerifier {
  verify(request: PlatformProofRequest): Promise<'valid' | 'invalid'>;
}
