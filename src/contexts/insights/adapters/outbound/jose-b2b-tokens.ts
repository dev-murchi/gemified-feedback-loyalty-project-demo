import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { Clock } from '../../../../shared-kernel/clock.js';
import { BrandId } from '../../../../shared-kernel/ids.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import type {
  B2bAccessTokens,
  B2bClaims,
  B2bUnauthorized,
  IssuedB2bToken,
} from '../../application/ports/b2b-access-tokens.js';
import { ClientId } from '../../domain/b2b-client/client-id.js';
import { parseScopes } from '../../domain/scope.js';
import type { B2bSigningKey } from './b2b-signing-key.js';

/** The contract's `expires_in`: 15 minutes. */
export const B2B_TOKEN_TTL_SECONDS = 900;
const AUDIENCE = 'b2b';

export interface JoseB2bTokensDeps {
  /** The B2B key only (B2B_JWT_PRIVATE_KEY), never the mobile one (owner decision 2 of S0-09). */
  readonly key: B2bSigningKey;
  readonly clock: Clock;
}

const unauthorized = (): Result<never, B2bUnauthorized> =>
  err({ code: 'UNAUTHORIZED' });

/** Verified claims as domain values; anything else is not a B2B token of ours. */
function toClaims(payload: JWTPayload): B2bClaims | undefined {
  const brand = BrandId.create(
    typeof payload['brand_id'] === 'string' ? payload['brand_id'] : '',
  );
  const scope = payload['scope'];
  const scopes = typeof scope === 'string' ? parseScopes(scope) : undefined;
  const clientId = ClientId.parse(payload.sub ?? '');
  if (!brand.ok || clientId === undefined || scopes === undefined)
    return undefined;
  return scopes.length === 0
    ? undefined
    : { clientId, brandId: brand.value, scopes };
}

/**
 * B2B access tokens as ES256 JWTs with their own key (owner decision 2 of S0-09): `aud` = b2b,
 * `sub` = client id, `brand_id`, `scope`, `kid` header, 15 minutes. Verification requires all of
 * them, so a mobile token can never pass the B2B guard, nor a B2B token the mobile one.
 */
export class JoseB2bTokens implements B2bAccessTokens {
  constructor(private readonly deps: JoseB2bTokensDeps) {}

  async issue(claims: B2bClaims): Promise<IssuedB2bToken> {
    const issuedAt = Math.floor(this.deps.clock.now().getTime() / 1000);
    const accessToken = await new SignJWT({
      brand_id: claims.brandId,
      scope: claims.scopes.join(' '),
    })
      .setProtectedHeader({ alg: 'ES256', kid: this.deps.key.keyId })
      .setAudience(AUDIENCE)
      .setSubject(claims.clientId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + B2B_TOKEN_TTL_SECONDS)
      .sign(this.deps.key.privateKey);
    return { accessToken, expiresIn: B2B_TOKEN_TTL_SECONDS };
  }

  async verify(token: string): Promise<Result<B2bClaims, B2bUnauthorized>> {
    try {
      const { payload, protectedHeader } = await jwtVerify(
        token,
        this.deps.key.publicKey,
        {
          algorithms: ['ES256'],
          audience: AUDIENCE,
          requiredClaims: ['sub', 'exp', 'aud'],
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
