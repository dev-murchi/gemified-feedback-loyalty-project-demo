import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type {
  AndroidEvidence,
  AttestationEvidence,
  AttestationRejection,
  AttestationVerifier,
  IosEvidence,
} from '../../application/ports/attestation-verifier.js';
import type {
  EvidenceField,
  EvidenceMalformed,
} from '../../domain/attestation-errors.js';
import type { Nonce } from '../../domain/challenge/nonce.js';
import { KeyIdentifier } from '../../domain/user/key-identifier.js';
import type { Platform } from '../../domain/user/platform.js';
import { PublicKey } from '../../domain/user/public-key.js';
import type { AttestedDeviceKey } from '../../domain/user/user.js';
import {
  parseDevProof,
  parseP256PublicKey,
  refuseInProduction,
  sha256,
  toBase64Url,
  verifyDerSignature,
  type DevProof,
  type DevPublicKey,
} from './dev-attestation-crypto.js';

type Verdict = Result<AttestedDeviceKey, AttestationRejection>;

/** Android's `certificateChain[1]` in development mode: base64("dev"). */
const ANDROID_DEV_MARKER = 'ZGV2';

const malformed = (field: EvidenceField): Result<never, EvidenceMalformed> =>
  err({ code: 'VALIDATION_ERROR', field });

/** What a platform path has worked out before the signature is checked. */
interface Claim {
  readonly platform: Platform;
  readonly keyIdentifier: string;
  readonly key: DevPublicKey;
  readonly proof: DevProof;
  /** The 32 bytes the device's ES256 signer was given. */
  readonly message: Buffer;
  readonly field: EvidenceField;
}

/**
 * Development stand-in for Apple App Attest and Google Key Attestation + Play Integrity (SDD 7.1).
 * The cryptography is real (P-256, ES256, proof of possession of the key), the attestation
 * envelope is made up: see `RegisterRequest*` in docs/api/openapi.yaml. It must never run in
 * production: `forEnvironment` refuses (TC-AUTH-09, T-E3).
 */
export class DevAttestationVerifier implements AttestationVerifier {
  private constructor() {}

  /** The only way to get one: the application does not start in production with it. */
  static forEnvironment(nodeEnv: string | undefined): DevAttestationVerifier {
    refuseInProduction(nodeEnv, 'DevAttestationVerifier');
    return new DevAttestationVerifier();
  }

  verify(request: {
    readonly nonce: Nonce;
    readonly evidence: AttestationEvidence;
  }): Promise<Verdict> {
    const { nonce, evidence } = request;
    const claim =
      evidence.platform === 'ios'
        ? this.#iosClaim(nonce, evidence)
        : this.#androidClaim(nonce, evidence);
    return Promise.resolve(claim.ok ? this.#judge(claim.value) : claim);
  }

  /** iOS: SHA-256(nonce) is signed; `keyId` is the SHA-256 of the public key, standard base64. */
  #iosClaim(
    nonce: Nonce,
    evidence: IosEvidence,
  ): Result<Claim, EvidenceMalformed> {
    const proof = parseDevProof(evidence.attestationObject, true);
    const key =
      proof?.publicKey === undefined
        ? undefined
        : parseP256PublicKey(proof.publicKey);
    if (proof === undefined || key === undefined)
      return malformed('attestationObject');
    if (evidence.keyId !== sha256(key.der).toString('base64'))
      return malformed('keyId');
    return ok({
      platform: 'ios',
      keyIdentifier: evidence.keyId,
      key,
      proof,
      message: sha256(Buffer.from(nonce, 'utf8')),
      field: 'attestationObject',
    });
  }

  /** Android: SHA-256(nonce ‖ public key) is signed; the key id is the key's SHA-256, base64url. */
  #androidClaim(
    nonce: Nonce,
    evidence: AndroidEvidence,
  ): Result<Claim, EvidenceMalformed> {
    const [leaf, marker] = evidence.certificateChain;
    const key = leaf === undefined ? undefined : parseP256PublicKey(leaf);
    if (
      evidence.certificateChain.length !== 2 ||
      marker !== ANDROID_DEV_MARKER ||
      key === undefined
    )
      return malformed('certificateChain');
    const proof = parseDevProof(evidence.integrityToken, false);
    if (proof === undefined) return malformed('integrityToken');
    return ok({
      platform: 'android',
      keyIdentifier: toBase64Url(sha256(key.der)),
      key,
      proof,
      message: sha256(Buffer.from(nonce, 'utf8'), key.der),
      field: 'integrityToken',
    });
  }

  /** Possession of the key first; only then does the integrity verdict decide the trust. */
  #judge(claim: Claim): Verdict {
    if (
      !verifyDerSignature(
        { publicKey: claim.key.key, signature: claim.proof.signature },
        claim.message,
      )
    )
      return err({ code: 'SIGNATURE_INVALID' });
    const keyIdentifier = KeyIdentifier.parse(claim.keyIdentifier);
    const publicKey = PublicKey.parse(claim.key.der.toString('base64'));
    if (!keyIdentifier.ok || !publicKey.ok) return malformed(claim.field);
    return ok({
      platform: claim.platform,
      keyIdentifier: keyIdentifier.value,
      publicKey: publicKey.value,
      attestation: claim.proof.integrity === 'pass' ? 'passed' : 'failed',
    });
  }
}
