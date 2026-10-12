import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import type { Branded } from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';

/**
 * Identifies a device key (DEVICE_KEYS.key_identifier, unique): iOS the App Attest key id, Android
 * the SHA-256 fingerprint of the public key (docs/api/openapi.yaml, `keyId`).
 */
export type KeyIdentifier = Branded<string, 'KeyIdentifier'>;

export interface InvalidKeyIdentifier extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'keyId';
}

/**
 * Standard base64 or base64url. A SHA-256 is 43–44 characters; the bounds only reject nonsense,
 * the attestation verifier checks the exact value.
 */
const FORMAT = /^[A-Za-z0-9+/_-]{16,128}={0,2}$/;

export const KeyIdentifier = {
  parse(raw: string): Result<KeyIdentifier, InvalidKeyIdentifier> {
    return FORMAT.test(raw)
      ? ok(raw as KeyIdentifier)
      : err({ code: 'VALIDATION_ERROR', field: 'keyId' });
  },
};
