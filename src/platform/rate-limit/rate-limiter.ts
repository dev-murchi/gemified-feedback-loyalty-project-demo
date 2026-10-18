/** How fast a caller may go: a steady rate, and how many requests may arrive at once (a burst). */
export interface RateLimitPolicy {
  readonly perMinute: number;
  readonly burst: number;
}

/** The answer to one request. A refused request says how long to wait, in whole seconds (≥ 1). */
export type RateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * Technical rate limit (FR-QR-06, ADR-016): GCRA per key. An allowed call uses up capacity; a
 * refused call uses none. The key says who is limited (`rl:device:<id>`); the policy says how much.
 * Business quotas (reward cooldown, attempts) are not here: they live in the RewardCooldown aggregate.
 */
export interface RateLimiter {
  check(key: string, policy: RateLimitPolicy): Promise<RateLimitDecision>;
}
