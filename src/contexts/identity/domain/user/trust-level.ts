/** The outcome of the platform attestation at registration (DEVICE_KEYS.attestation_result). */
export type AttestationResult = 'passed' | 'failed';

/** `low`: the user can write feedback but never earns rewards (FR-AUTH-06). */
export type TrustLevel = 'normal' | 'low';

/** FR-AUTH-06: the trust level follows only from the attestation result; a client cannot choose it. */
export const trustLevelFor = (attestation: AttestationResult): TrustLevel =>
  attestation === 'passed' ? 'normal' : 'low';
