import { err, type Result } from '../../../../shared-kernel/result.js';
import type {
  AccessTokenClaims,
  Unauthorized,
} from '../../domain/session/access-token-claims.js';
import type { AccessTokenVerifier } from '../ports/access-token-verifier.js';

export interface AuthenticateRequestDeps {
  readonly tokens: AccessTokenVerifier;
}

/** The `Authorization` header as received; undefined if the request had none. */
export interface AuthenticateRequestQuery {
  readonly authorization: string | undefined;
}

/** The scheme name is case-insensitive (RFC 7235). */
const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/i;

/**
 * Who is calling? Reads the bearer token (mobileBearer, docs/api/openapi.yaml). Missing, malformed,
 * tampered and expired tokens are all UNAUTHORIZED (401, TC-AUTH-08), so the app fetches a new
 * challenge and opens a new session. The token is trusted until it expires (at most 15 minutes);
 * a key revoked meanwhile is refused at the next session, not at each request.
 */
export class AuthenticateRequest {
  constructor(private readonly deps: AuthenticateRequestDeps) {}

  execute(
    query: AuthenticateRequestQuery,
  ): Promise<Result<AccessTokenClaims, Unauthorized>> {
    const token = BEARER.exec(query.authorization ?? '')?.[1];
    return token === undefined
      ? Promise.resolve(err({ code: 'UNAUTHORIZED' }))
      : this.deps.tokens.verify(token);
  }
}
