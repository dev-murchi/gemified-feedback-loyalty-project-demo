import type { DomainError } from '../../shared-kernel/domain-error.js';
import { err, ok, type Result } from '../../shared-kernel/result.js';
import type {
  RateLimitPolicy,
  RateLimiter,
} from '../rate-limit/rate-limiter.js';

/** Injection token for the RateLimitEnforcer the composition root provides. */
export const RATE_LIMIT_ENFORCER = Symbol('RateLimitEnforcer');

/** One policy for each kind of caller (SRS FR-QR-06). */
export interface RateLimitPolicies {
  readonly device: RateLimitPolicy;
  readonly client: RateLimitPolicy;
  readonly ip: RateLimitPolicy;
}

/** The caller is over its limit; `ProblemException.from` makes it `429 RATE_LIMITED` with the wait. */
export interface RateLimited extends DomainError<'RATE_LIMITED'> {
  readonly retryAfterSeconds: number;
}

export interface RateLimitEnforcerDeps {
  readonly limiter: RateLimiter;
  readonly policies: RateLimitPolicies;
}

/**
 * Chooses WHO is limited. A verified mobile caller is counted by its device key and a B2B caller by
 * its client id, both only after authentication; the IP address counts only where no identity
 * exists yet. A verified device is never counted by IP, because many real phones share one address
 * (CGNAT, T-D6).
 */
export class RateLimitEnforcer {
  constructor(private readonly deps: RateLimitEnforcerDeps) {}

  device(keyIdentifier: string): Promise<Result<void, RateLimited>> {
    return this.#enforce(
      `rl:device:${keyIdentifier}`,
      this.deps.policies.device,
    );
  }

  client(clientId: string): Promise<Result<void, RateLimited>> {
    return this.#enforce(`rl:client:${clientId}`, this.deps.policies.client);
  }

  ip(address: string): Promise<Result<void, RateLimited>> {
    return this.#enforce(`rl:ip:${address}`, this.deps.policies.ip);
  }

  async #enforce(
    key: string,
    policy: RateLimitPolicy,
  ): Promise<Result<void, RateLimited>> {
    const decision = await this.deps.limiter.check(key, policy);
    return decision.allowed
      ? ok(undefined)
      : err({
          code: 'RATE_LIMITED',
          retryAfterSeconds: decision.retryAfterSeconds,
        });
  }
}
