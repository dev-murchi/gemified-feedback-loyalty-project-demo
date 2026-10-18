import { Module } from '@nestjs/common';
import type { AuthenticateRequest } from '../contexts/identity/application/use-cases/authenticate-request.js';
import {
  AUTHENTICATOR,
  BearerAuthGuard,
  type Authenticator,
} from '../platform/http/bearer-auth.guard.js';
import { RATE_LIMIT_ENFORCER } from '../platform/http/rate-limit.enforcer.js';
import type { RateLimitEnforcer } from '../platform/http/rate-limit.enforcer.js';
import { withDeviceLimit } from '../platform/http/rate-limited-authenticators.js';
import { IdentityModule } from './identity.module.js';
import { AUTHENTICATE_REQUEST } from './tokens.js';

/** Adapts Identity's claims to the platform's Principal, so platform/ imports no context. */
const authenticatorFor = (
  authenticate: AuthenticateRequest,
): Authenticator => ({
  async authenticate(authorization) {
    const caller = await authenticate.execute({ authorization });
    return caller.ok ? { ok: true, value: { ...caller.value } } : caller;
  },
});

/**
 * What a module needs to guard its routes with BearerAuthGuard: import this module. The
 * authenticator counts every verified device against its rate limit (FR-QR-06).
 */
@Module({
  imports: [IdentityModule],
  providers: [
    {
      provide: AUTHENTICATOR,
      inject: [AUTHENTICATE_REQUEST, RATE_LIMIT_ENFORCER],
      useFactory: (
        authenticate: AuthenticateRequest,
        limits: RateLimitEnforcer,
      ) => withDeviceLimit(authenticatorFor(authenticate), limits),
    },
    BearerAuthGuard,
  ],
  exports: [AUTHENTICATOR, BearerAuthGuard],
})
export class AuthenticationModule {}
