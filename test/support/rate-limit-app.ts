import { rateLimitConfigFrom } from '../../src/composition/rate-limit-config.js';
import type { RateLimitConfig } from '../../src/composition/rate-limit-config.js';
import { RATE_LIMIT_CONFIG } from '../../src/composition/tokens.js';
import type { RateLimitPolicy } from '../../src/platform/rate-limit/rate-limiter.js';
import type { Customise } from './start-app.js';

/** One request a second, a burst of `burst`: easy to reason about with a controllable clock. */
export const perSecond = (burst: number): RateLimitPolicy => ({
  perMinute: 60,
  burst,
});

/** Limits so high that a test never meets them. */
export const UNLIMITED: RateLimitPolicy = {
  perMinute: 600_000,
  burst: 100_000,
};

export interface Limits {
  readonly device?: RateLimitPolicy;
  readonly client?: RateLimitPolicy;
  readonly ip?: RateLimitPolicy;
  readonly trustProxyHops?: number;
}

/** The app's rate limit settings replaced; whatever is not named is unlimited. */
export const withLimits =
  (limits: Limits): Customise =>
  (builder) => {
    const config: RateLimitConfig = {
      ...rateLimitConfigFrom({}),
      policies: {
        device: limits.device ?? UNLIMITED,
        client: limits.client ?? UNLIMITED,
        ip: limits.ip ?? UNLIMITED,
      },
      trustProxyHops: limits.trustProxyHops ?? 0,
    };
    return builder.overrideProvider(RATE_LIMIT_CONFIG).useValue(config);
  };
