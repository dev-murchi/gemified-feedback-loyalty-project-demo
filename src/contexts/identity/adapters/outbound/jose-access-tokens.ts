import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { Clock } from '../../../../shared-kernel/clock.js';
import { UserId } from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type {
  AccessTokenIssuer,
  IssuedAccessToken,
} from '../../application/ports/access-token-issuer.js';
import type { AccessTokenVerifier } from '../../application/ports/access-token-verifier.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  type AccessTokenClaims,
  type Unauthorized,
} from '../../domain/session/access-token-claims.js';
import { KeyIdentifier } from '../../domain/user/key-identifier.js';
import type { TrustLevel } from '../../domain/user/trust-level.js';
import type { SigningKey } from './signing-key.js';

export interface JoseAccessTokensDeps {
  readonly key: SigningKey;
  readonly clock: Clock;
}

const unauthorized = (): Result<never, Unauthorized> =>
  err({ code: 'UNAUTHORIZED' });

const isTrustLevel = (value: unknown): value is TrustLevel =>
  value === 'normal' || value === 'low';

/** Turns verified token claims into domain types; anything else is not our token. */
function toClaims(payload: JWTPayload): AccessTokenClaims | undefined {
  const userId = UserId.create(payload.sub ?? '');
  const dk = payload['dk'];
  const keyIdentifier = KeyIdentifier.parse(typeof dk === 'string' ? dk : '');
  const trust = payload['trust'];
  if (!userId.ok || !keyIdentifier.ok || !isTrustLevel(trust)) return undefined;
  return {
    userId: userId.value,
    keyIdentifier: keyIdentifier.value,
    trustLevel: trust,
  };
}

/**
 * The access token as an ES256 JWT (SDD 7.1): `sub` = user, `dk` = device key, `trust` = trust
 * level, `kid` header, at most 15 minutes, no refresh token. Verification accepts only ES256 with
 * our key and our `kid`, and judges expiry by the injected clock.
 */
export class JoseAccessTokens
  implements AccessTokenIssuer, AccessTokenVerifier
{
  constructor(private readonly deps: JoseAccessTokensDeps) {}

  async issue(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const issuedAt = Math.floor(this.deps.clock.now().getTime() / 1000);
    const accessToken = await new SignJWT({
      dk: claims.keyIdentifier,
      trust: claims.trustLevel,
    })
      .setProtectedHeader({ alg: 'ES256', kid: this.deps.key.keyId })
      .setSubject(claims.userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.deps.key.privateKey);
    return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  async verify(
    token: string,
  ): Promise<Result<AccessTokenClaims, Unauthorized>> {
    try {
      const { payload, protectedHeader } = await jwtVerify(
        token,
        this.deps.key.publicKey,
        {
          algorithms: ['ES256'],
          requiredClaims: ['sub', 'exp'],
          currentDate: this.deps.clock.now(),
        },
      );
      const claims = toClaims(payload);
      const ours = protectedHeader.kid === this.deps.key.keyId;
      return claims !== undefined && ours ? ok(claims) : unauthorized();
    } catch {
      return unauthorized();
    }
  }
}
