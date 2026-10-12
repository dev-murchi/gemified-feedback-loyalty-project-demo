import type { DomainError } from '../../../../shared-kernel/domain-error.js';

/** The device key was revoked (FR-AUTH-07); API code KEY_REVOKED (403). */
export type KeyRevoked = DomainError<'KEY_REVOKED'>;

/** The user has no device key with this identifier. */
export type DeviceKeyNotFound = DomainError<'NOT_FOUND'>;

/** What a revocation did; either way the caller gets ok (revoking twice is not an error). */
export type RevokeOutcome = 'revoked' | 'already_revoked';
