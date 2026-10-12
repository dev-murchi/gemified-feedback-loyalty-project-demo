import type { AccessTokenClaims } from '../../domain/session/access-token-claims.js';

export interface IssuedAccessToken {
  readonly accessToken: string;
  /** Seconds the token stays valid, at most ACCESS_TOKEN_TTL_SECONDS. */
  readonly expiresIn: number;
}

/** Mints the short-lived access token (SDD 7.1). No refresh token exists. */
export interface AccessTokenIssuer {
  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
}
