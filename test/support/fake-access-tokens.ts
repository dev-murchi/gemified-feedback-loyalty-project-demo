import type {
  AccessTokenIssuer,
  IssuedAccessToken,
} from '../../src/contexts/identity/application/ports/access-token-issuer.js';
import type { AccessTokenVerifier } from '../../src/contexts/identity/application/ports/access-token-verifier.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  type AccessTokenClaims,
  type Unauthorized,
} from '../../src/contexts/identity/domain/session/access-token-claims.js';
import type { Clock } from '../../src/shared-kernel/clock.js';
import { err, ok, type Result } from '../../src/shared-kernel/result.js';

/**
 * In-memory access tokens for use case tests: opaque strings that the same fake can read back.
 * The ES256 adapter (jose) has its own tests; here only the use cases' behaviour matters.
 */
export class FakeAccessTokens
  implements AccessTokenIssuer, AccessTokenVerifier
{
  readonly issued: AccessTokenClaims[] = [];
  readonly #tokens = new Map<
    string,
    { claims: AccessTokenClaims; expiresAt: number }
  >();

  constructor(private readonly clock: Clock) {}

  issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const accessToken = `fake-token-${this.issued.length + 1}`;
    this.issued.push(claims);
    this.#tokens.set(accessToken, {
      claims,
      expiresAt: this.clock.now().getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
    return Promise.resolve({
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  verify(token: string): Promise<Result<AccessTokenClaims, Unauthorized>> {
    const entry = this.#tokens.get(token);
    const live =
      entry !== undefined && this.clock.now().getTime() < entry.expiresAt;
    return Promise.resolve(
      live ? ok(entry.claims) : err({ code: 'UNAUTHORIZED' }),
    );
  }
}
