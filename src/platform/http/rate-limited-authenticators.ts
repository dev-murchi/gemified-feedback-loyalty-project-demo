import type { Authenticator } from './bearer-auth.guard.js';
import type { ClientAuthenticator } from './client-auth.guard.js';
import type { RateLimitEnforcer } from './rate-limit.enforcer.js';
import type { RefusalSummary } from './refusal-summary.js';

/**
 * Authenticate first, then count the verified device against its limit (FR-QR-06). A call with an
 * invalid token never reaches the limiter, so nobody can use up another device's budget. Built in
 * the composition root around the real authenticator; the guards do not know about limits.
 */
export function withDeviceLimit(
  inner: Authenticator,
  limits: RateLimitEnforcer,
): Authenticator {
  return {
    async authenticate(authorization) {
      const caller = await inner.authenticate(authorization);
      if (!caller.ok) return caller;
      const counted = await limits.device(caller.value.keyIdentifier);
      return counted.ok ? caller : counted;
    },
  };
}

/**
 * Authenticate first, then count the verified B2B client against its limit. This happens before
 * the guard's scope check, so a client that keeps asking for a scope it lacks cannot flood the
 * audit log either. A refused call is not audited; the summary reports it once per window.
 */
export function withClientLimit(
  inner: ClientAuthenticator,
  limits: RateLimitEnforcer,
  summary: RefusalSummary,
): ClientAuthenticator {
  return {
    async authenticate(authorization, endpoint) {
      const caller = await inner.authenticate(authorization, endpoint);
      if (!caller.ok) return caller;
      const counted = await limits.client(caller.value.clientId);
      if (!counted.ok) summary.refused(caller.value.clientId, endpoint);
      return counted.ok ? caller : counted;
    },
  };
}
