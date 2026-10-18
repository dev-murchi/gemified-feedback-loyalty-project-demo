import type { Logger } from '../../shared-kernel/logger.js';
import { OutageLog } from '../redis/outage-log.js';
import type {
  RateLimitDecision,
  RateLimitPolicy,
  RateLimiter,
} from './rate-limiter.js';

export interface FailOpenRateLimiterDeps {
  readonly inner: RateLimiter;
  readonly logger: Logger;
}

/**
 * A technical limit must not take the API down with it: when the limiter fails (Redis is
 * unreachable), the request is allowed. The outage is logged once (warn) and the recovery once
 * (info), not once per request. Keys, which hold device ids and IP addresses, are never logged (T-I4).
 */
export class FailOpenRateLimiter implements RateLimiter {
  readonly #outage: OutageLog;

  constructor(private readonly deps: FailOpenRateLimiterDeps) {
    this.#outage = new OutageLog({
      logger: deps.logger,
      down: 'Rate limiter unavailable; allowing requests',
      up: 'Rate limiter available again',
    });
  }

  async check(
    key: string,
    policy: RateLimitPolicy,
  ): Promise<RateLimitDecision> {
    try {
      const decision = await this.deps.inner.check(key, policy);
      this.#outage.recovered();
      return decision;
    } catch (error) {
      this.#outage.failed(error);
      return { allowed: true };
    }
  }
}
