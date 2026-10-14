import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import type {
  AndroidEvidence,
  IosEvidence,
} from '../../src/contexts/identity/application/ports/attestation-verifier.js';

const sha256 = (...parts: Uint8Array[]): Buffer => {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest();
};

const json64 = (value: object): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

export interface EvidenceOptions {
  readonly integrity?: 'pass' | 'fail';
  /** The bytes given to the ES256 signer instead of the correct 32-byte digest. */
  readonly signedMessage?: Buffer;
  /** Another device signs instead (no proof of possession). */
  readonly signer?: FakeDevice;
  /** Sign as raw r‖s (64 bytes) instead of ASN.1 DER. */
  readonly rawSignature?: boolean;
  /** Replaces or adds fields of the JSON envelope; `undefined` removes a field. */
  readonly envelope?: Record<string, unknown>;
}

/**
 * A test double for a phone: a real P-256 key pair that builds development-mode evidence exactly
 * as docs/api/openapi.yaml describes it (RegisterRequestIos / RegisterRequestAndroid).
 */
export class FakeDevice {
  readonly #privateKey: KeyObject;
  /** DER SPKI bytes of the public key. */
  readonly publicKeyDer: Buffer;

  constructor(curve: 'prime256v1' | 'secp384r1' = 'prime256v1') {
    const pair = generateKeyPairSync('ec', { namedCurve: curve });
    this.#privateKey = pair.privateKey;
    this.publicKeyDer = pair.publicKey.export({ type: 'spki', format: 'der' });
  }

  /** iOS key id in development mode: SHA-256 of the public key, standard base64. */
  get iosKeyId(): string {
    return sha256(this.publicKeyDer).toString('base64');
  }

  /** Android key identifier: SHA-256 of the public key, base64url. */
  get androidKeyIdentifier(): string {
    return sha256(this.publicKeyDer).toString('base64url');
  }

  /** What the iOS signer is given: SHA-256 of the nonce's UTF-8 bytes. */
  static iosMessage(nonce: string): Buffer {
    return sha256(Buffer.from(nonce, 'utf8'));
  }

  /** What the Android signer is given: SHA-256 of the nonce's bytes followed by the public key. */
  androidMessage(nonce: string): Buffer {
    return sha256(Buffer.from(nonce, 'utf8'), this.publicKeyDer);
  }

  iosEvidence(nonce: string, options: EvidenceOptions = {}): IosEvidence {
    const message = options.signedMessage ?? FakeDevice.iosMessage(nonce);
    return {
      platform: 'ios',
      keyId: this.iosKeyId,
      attestationObject: json64(
        this.#envelope(options, message, {
          publicKey: this.publicKeyDer.toString('base64'),
        }),
      ),
    };
  }

  androidEvidence(
    nonce: string,
    options: EvidenceOptions = {},
  ): AndroidEvidence {
    const message = options.signedMessage ?? this.androidMessage(nonce);
    return {
      platform: 'android',
      certificateChain: [this.publicKeyDer.toString('base64'), 'ZGV2'],
      integrityToken: json64(this.#envelope(options, message, {})),
    };
  }

  /** The session proof in development mode: a DER signature over SHA-256(nonce), standard base64. */
  sessionProof(nonce: string, options: EvidenceOptions = {}): string {
    const message = options.signedMessage ?? FakeDevice.iosMessage(nonce);
    const signer = options.signer ?? this;
    return signer.sign(message, options.rawSignature).toString('base64');
  }

  /**
   * The `X-Platform-Proof` in development mode: a DER signature over
   * SHA-256(Idempotency-Key ‖ raw body), standard base64.
   */
  requestProof(
    idempotencyKey: string,
    body: Uint8Array,
    options: EvidenceOptions = {},
  ): string {
    const message =
      options.signedMessage ??
      sha256(Buffer.from(idempotencyKey, 'utf8'), body);
    const signer = options.signer ?? this;
    return signer.sign(message, options.rawSignature).toString('base64');
  }

  /** ES256 over `message` as the platform signer does: it hashes the given bytes once more. */
  sign(message: Buffer, rawSignature = false): Buffer {
    return sign('sha256', message, {
      key: this.#privateKey,
      dsaEncoding: rawSignature ? 'ieee-p1363' : 'der',
    });
  }

  #envelope(
    options: EvidenceOptions,
    message: Buffer,
    extra: Record<string, unknown>,
  ): Record<string, unknown> {
    const signer = options.signer ?? this;
    const envelope: Record<string, unknown> = {
      format: 'dev',
      ...extra,
      signature: signer.sign(message, options.rawSignature).toString('base64'),
      integrity: options.integrity ?? 'pass',
      ...options.envelope,
    };
    return Object.fromEntries(
      Object.entries(envelope).filter(([, value]) => value !== undefined),
    );
  }
}
