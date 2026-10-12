import type { Result } from '../../../../shared-kernel/result.js';
import type {
  AccessTokenClaims,
  Unauthorized,
} from '../../domain/session/access-token-claims.js';

/** Reads an access token back: signature, expiry and claim shapes are all checked. */
export interface AccessTokenVerifier {
  verify(token: string): Promise<Result<AccessTokenClaims, Unauthorized>>;
}
