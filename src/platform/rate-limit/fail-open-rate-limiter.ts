import type { Logger } from '../../shared-kernel/logger.js';
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
  #down = false;

  constructor(private readonly deps: FailOpenRateLimiterDeps) {}

  async check(
    key: string,
    policy: RateLimitPolicy,
  ): Promise<RateLimitDecision> {
    try {
      const decision = await this.deps.inner.check(key, policy);
      this.#recovered();
      return decision;
    } catch (error) {
      this.#failed(error);
      return { allowed: true };
    }
  }

  #failed(error: unknown): void {
    if (this.#down) return;
    this.#down = true;
    this.deps.logger.warn('Rate limiter unavailable; allowing requests', {
      error: error instanceof Error ? error.name : typeof error,
    });
  }

  #recovered(): void {
    if (!this.#down) return;
    this.#down = false;
    this.deps.logger.info('Rate limiter available again');
  }
}
