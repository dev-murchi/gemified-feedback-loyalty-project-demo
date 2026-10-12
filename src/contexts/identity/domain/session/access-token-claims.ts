import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import type { UserId } from '../../../../shared-kernel/ids.js';
import type { KeyIdentifier } from '../user/key-identifier.js';
import type { TrustLevel } from '../user/trust-level.js';

/** SDD 7.1 and the `Session.expiresIn` maximum in docs/api/openapi.yaml: 15 minutes. */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

/** What an access token says about its holder: `sub`, `dk` and `trust` in SDD 7.1. */
export interface AccessTokenClaims {
  readonly userId: UserId;
  readonly keyIdentifier: KeyIdentifier;
  readonly trustLevel: TrustLevel;
}

/** Missing, malformed, tampered or expired access token; API code UNAUTHORIZED (401). */
export type Unauthorized = DomainError<'UNAUTHORIZED'>;
