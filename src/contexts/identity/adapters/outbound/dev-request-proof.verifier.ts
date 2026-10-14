import type { RequestProofVerifier } from '../../application/ports/request-proof-verifier.js';
import type { PublicKey } from '../../domain/user/public-key.js';
import {
  decodeStandardBase64,
  parseP256PublicKey,
  refuseInProduction,
  sha256,
  verifyDerSignature,
} from './dev-attestation-crypto.js';

/**
 * Development stand-in for the per-request App Attest assertion and Play Integrity verdict
 * (docs/api/openapi.yaml, `X-Platform-Proof`): a standard base64 ASN.1 DER ES256 signature over
 * SHA-256(Idempotency-Key ‖ raw body), with no counter. Binding the key as well stops a captured
 * body from being sent again under a new key. Refuses to exist in production.
 */
export class DevRequestProofVerifier implements RequestProofVerifier {
  private constructor() {}

  static forEnvironment(nodeEnv: string | undefined): DevRequestProofVerifier {
    refuseInProduction(nodeEnv, 'DevRequestProofVerifier');
    return new DevRequestProofVerifier();
  }

  verify(request: {
    readonly publicKey: PublicKey;
    readonly idempotencyKey: string;
    readonly body: Uint8Array;
    readonly proof: string;
  }): Promise<boolean> {
    const key = parseP256PublicKey(request.publicKey);
    const signature = decodeStandardBase64(request.proof);
    const message = sha256(
      Buffer.from(request.idempotencyKey, 'utf8'),
      request.body,
    );
    return Promise.resolve(
      key !== undefined &&
        signature !== undefined &&
        verifyDerSignature({ publicKey: key.key, signature }, message),
    );
  }
}
