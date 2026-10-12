import {
  createHash,
  createPublicKey,
  verify,
  type KeyObject,
} from 'node:crypto';

// Helpers of the development attestation (docs/api/openapi.yaml, RegisterRequest*). Real P-256
// cryptography with a made-up attestation envelope; only DevAttestationVerifier uses them.

export const sha256 = (...parts: Uint8Array[]): Buffer => {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest();
};

/** Standard base64 only: padding required, no URL alphabet, no stray characters. */
export const decodeStandardBase64 = (value: string): Buffer | undefined => {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0)
    return undefined;
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : undefined;
};

export const toBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64url');

export interface DevPublicKey {
  /** The DER SPKI bytes as the device sent them. */
  readonly der: Buffer;
  readonly key: KeyObject;
}

/** Accepts only a P-256 public key in DER SPKI form (the key type of ES256). */
export const parseP256PublicKey = (
  base64: string,
): DevPublicKey | undefined => {
  const der = decodeStandardBase64(base64);
  if (der === undefined) return undefined;
  try {
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    const isP256 =
      key.asymmetricKeyType === 'ec' &&
      key.asymmetricKeyDetails?.namedCurve === 'prime256v1';
    return isP256 ? { der, key } : undefined;
  } catch {
    return undefined;
  }
};

/**
 * ES256 over a 32-byte message: the signer was given the 32 bytes and hashed them once more, as
 * every ES256 signer does. Signatures must be ASN.1 DER; raw r‖s does not parse and is rejected.
 */
export const verifyDerSignature = (
  proof: { readonly publicKey: KeyObject; readonly signature: Buffer },
  message: Buffer,
): boolean => {
  try {
    return verify(
      'sha256',
      message,
      { key: proof.publicKey, dsaEncoding: 'der' },
      proof.signature,
    );
  } catch {
    return false;
  }
};

export type Integrity = 'pass' | 'fail';

export interface DevProof {
  readonly signature: Buffer;
  readonly integrity: Integrity;
  /** Only in the iOS envelope. */
  readonly publicKey: string | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readJson = (encoded: string): unknown => {
  const bytes = decodeStandardBase64(encoded);
  if (bytes === undefined) return undefined;
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
};

const isIntegrity = (value: unknown): value is Integrity =>
  value === 'pass' || value === 'fail';

const readEnvelope = (encoded: string): Record<string, unknown> | undefined => {
  const json = readJson(encoded);
  return isRecord(json) && json['format'] === 'dev' ? json : undefined;
};

const readSignature = (value: unknown): Buffer | undefined =>
  typeof value === 'string' ? decodeStandardBase64(value) : undefined;

/**
 * Reads the base64 JSON envelope `{"format":"dev","signature":…,"integrity":…}`; the iOS one also
 * carries `publicKey`. `format` must be exactly `dev`. Undefined if anything is off.
 */
export const parseDevProof = (
  encoded: string,
  withPublicKey: boolean,
): DevProof | undefined => {
  const envelope = readEnvelope(encoded);
  if (envelope === undefined) return undefined;
  const signature = readSignature(envelope['signature']);
  const integrity = envelope['integrity'];
  const publicKey = envelope['publicKey'];
  if (signature === undefined || !isIntegrity(integrity)) return undefined;
  if (!withPublicKey) return { signature, integrity, publicKey: undefined };
  return typeof publicKey === 'string'
    ? { signature, integrity, publicKey }
    : undefined;
};

/** The development stand-ins must never run in production (TC-AUTH-09, T-E3). */
export const refuseInProduction = (
  nodeEnv: string | undefined,
  what: string,
): void => {
  if (nodeEnv === 'production')
    throw new Error(`${what} must not be used with NODE_ENV=production`);
};
