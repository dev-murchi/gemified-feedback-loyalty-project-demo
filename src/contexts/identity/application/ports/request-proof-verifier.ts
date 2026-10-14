import type { PublicKey } from '../../domain/user/public-key.js';

/**
 * Checks one request's platform proof against the device's registered key (SDD 7.2): an App
 * Attest assertion on iOS, a Play Integrity verdict on Android. In the demo both are a plain ES256
 * signature (docs/api/openapi.yaml, `X-Platform-Proof`).
 */
export interface RequestProofVerifier {
  verify(request: {
    readonly publicKey: PublicKey;
    readonly idempotencyKey: string;
    readonly body: Uint8Array;
    readonly proof: string;
  }): Promise<boolean>;
}
