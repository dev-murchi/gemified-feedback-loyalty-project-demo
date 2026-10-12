import type { DomainError } from '../../../shared-kernel/domain-error.js';

/** The request fields of the register endpoint that carry attestation evidence. */
export type EvidenceField =
  'keyId' | 'attestationObject' | 'certificateChain' | 'integrityToken';

/** The evidence cannot be read at all (format problem); API code VALIDATION_ERROR (400). */
export interface EvidenceMalformed extends DomainError<'VALIDATION_ERROR'> {
  readonly field: EvidenceField;
}

/**
 * The device did not prove it holds the key: the signature over the challenge does not verify
 * (FR-AUTH-01, FR-AUTH-03); API code SIGNATURE_INVALID (401). Not the same as a failed platform
 * check, which registers a low-trust user (FR-AUTH-06).
 */
export type SignatureInvalid = DomainError<'SIGNATURE_INVALID'>;
