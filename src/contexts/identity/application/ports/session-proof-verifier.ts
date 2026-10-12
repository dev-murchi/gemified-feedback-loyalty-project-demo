import type { Result } from '../../../../shared-kernel/result.js';
import type { SignatureInvalid } from '../../domain/attestation-errors.js';
import type { Nonce } from '../../domain/challenge/nonce.js';
import type { PublicKey } from '../../domain/user/public-key.js';

/**
 * Checks that a device signed a challenge with its registered key (FR-AUTH-03). iOS sends an
 * App Attest assertion, Android a Keystore signature; this port hides the difference. In the demo
 * both are a plain ES256 signature (docs/api/openapi.yaml, `SessionRequest`).
 */
export interface SessionProofVerifier {
  verify(request: {
    readonly nonce: Nonce;
    readonly publicKey: PublicKey;
    /** The `assertion` (iOS) or `signature` (Android) field, as received. */
    readonly proof: string;
  }): Promise<Result<void, SignatureInvalid>>;
}
