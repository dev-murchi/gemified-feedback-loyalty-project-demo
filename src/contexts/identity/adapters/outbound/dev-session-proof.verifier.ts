import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type { SessionProofVerifier } from '../../application/ports/session-proof-verifier.js';
import type { SignatureInvalid } from '../../domain/attestation-errors.js';
import type { Nonce } from '../../domain/challenge/nonce.js';
import type { PublicKey } from '../../domain/user/public-key.js';
import {
  decodeStandardBase64,
  parseP256PublicKey,
  refuseInProduction,
  sha256,
  verifyDerSignature,
} from './dev-attestation-crypto.js';

/**
 * Development stand-in for the App Attest assertion and the Keystore signature at session time
 * (docs/api/openapi.yaml, `SessionRequest`): the proof is a standard base64 ASN.1 DER ES256
 * signature over SHA-256(nonce), the same for both platforms. Like DevAttestationVerifier it
 * refuses to exist in production.
 */
export class DevSessionProofVerifier implements SessionProofVerifier {
  private constructor() {}

  static forEnvironment(nodeEnv: string | undefined): DevSessionProofVerifier {
    refuseInProduction(nodeEnv, 'DevSessionProofVerifier');
    return new DevSessionProofVerifier();
  }

  verify(request: {
    readonly nonce: Nonce;
    readonly publicKey: PublicKey;
    readonly proof: string;
  }): Promise<Result<void, SignatureInvalid>> {
    const key = parseP256PublicKey(request.publicKey);
    const signature = decodeStandardBase64(request.proof);
    const valid =
      key !== undefined &&
      signature !== undefined &&
      verifyDerSignature(
        { publicKey: key.key, signature },
        sha256(Buffer.from(request.nonce, 'utf8')),
      );
    return Promise.resolve(
      valid ? ok(undefined) : err({ code: 'SIGNATURE_INVALID' }),
    );
  }
}
