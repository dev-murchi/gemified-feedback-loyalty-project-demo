import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import type { BrandId } from '../../../../shared-kernel/ids.js';
import type { Result } from '../../../../shared-kernel/result.js';
import type { ClientId } from '../../domain/b2b-client/client-id.js';
import type { Scope } from '../../domain/scope.js';

/** What a B2B access token says about its holder. */
export interface B2bClaims {
  readonly clientId: ClientId;
  readonly brandId: BrandId;
  readonly scopes: readonly Scope[];
}

export interface IssuedB2bToken {
  readonly accessToken: string;
  /** Seconds; the contract's `expires_in` (15 minutes). */
  readonly expiresIn: number;
}

/** Missing, malformed, tampered, expired, or not a B2B token at all; API code UNAUTHORIZED (401). */
export type B2bUnauthorized = DomainError<'UNAUTHORIZED'>;

export interface B2bAccessTokens {
  issue(claims: B2bClaims): Promise<IssuedB2bToken>;
  verify(token: string): Promise<Result<B2bClaims, B2bUnauthorized>>;
}
