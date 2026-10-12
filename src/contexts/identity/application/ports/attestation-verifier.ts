import type { Result } from '../../../../shared-kernel/result.js';
import type {
  EvidenceMalformed,
  SignatureInvalid,
} from '../../domain/attestation-errors.js';
import type { Nonce } from '../../domain/challenge/nonce.js';
import type { AttestedDeviceKey } from '../../domain/user/user.js';

/** What an iOS device sends to register (`RegisterRequestIos`); raw strings as received. */
export interface IosEvidence {
  readonly platform: 'ios';
  readonly keyId: string;
  readonly attestationObject: string;
}

/** What an Android device sends to register (`RegisterRequestAndroid`); raw strings as received. */
export interface AndroidEvidence {
  readonly platform: 'android';
  readonly certificateChain: readonly string[];
  readonly integrityToken: string;
}

export type AttestationEvidence = IosEvidence | AndroidEvidence;

export type AttestationRejection = EvidenceMalformed | SignatureInvalid;

/**
 * Anti-corruption layer towards Apple, Google and the development stand-in (SDD 7.1, docs/06
 * §5.1). It turns platform evidence into the device key the domain understands.
 *
 * - The device must prove it holds the key: otherwise `SIGNATURE_INVALID`.
 * - A platform check that fails (emulator, integrity verdict) is not a rejection: the key comes
 *   back with `attestation: 'failed'` and the user gets low trust (FR-AUTH-06).
 * - Evidence that cannot be read is `VALIDATION_ERROR` with the offending field.
 *
 * It calls external services in production, so it never runs inside a unit of work (docs/07 §5).
 */
export interface AttestationVerifier {
  verify(request: {
    readonly nonce: Nonce;
    readonly evidence: AttestationEvidence;
  }): Promise<Result<AttestedDeviceKey, AttestationRejection>>;
}
