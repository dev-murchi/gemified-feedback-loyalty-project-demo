import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import type { Branded } from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';

/**
 * A device's public key: the DER SPKI bytes, as standard base64 (the form the API contract uses).
 * A string keeps it immutable and comparable with `===`. That it really is a P-256 key is checked
 * by the attestation verifier (adapter), which needs cryptography the domain does not have.
 */
export type PublicKey = Branded<string, 'PublicKey'>;

export interface InvalidPublicKey extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'publicKey';
}

/** Standard base64 with padding; a P-256 DER SPKI is 91 bytes (124 characters). */
const FORMAT =
  /^(?:[A-Za-z0-9+/]{4}){1,256}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const PublicKey = {
  parse(raw: string): Result<PublicKey, InvalidPublicKey> {
    return FORMAT.test(raw)
      ? ok(raw as PublicKey)
      : err({ code: 'VALIDATION_ERROR', field: 'publicKey' });
  },
};
