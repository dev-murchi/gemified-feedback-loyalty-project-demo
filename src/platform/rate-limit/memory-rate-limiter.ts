import type { Clock } from '../../shared-kernel/clock.js';
import { gcra, retryAfterSecondsOf } from './gcra.js';
import type {
  RateLimitDecision,
  RateLimitPolicy,
  RateLimiter,
} from './rate-limiter.js';

/** Idle keys are dropped after this many checks, so a flood of distinct IPs cannot fill the memory. */
const SWEEP_EVERY = 1024;

export interface MemoryRateLimiterDeps {
  readonly clock: Clock;
}

/**
 * The limiter for tests and the single-process demo. It is per process: with two API instances
 * each one counts on its own, so SDD 9.1 deployments use the Redis limiter.
 */
export class MemoryRateLimiter implements RateLimiter {
  readonly #tats = new Map<string, number>();
  #checks = 0;

  constructor(private readonly deps: MemoryRateLimiterDeps) {}

  check(key: string, policy: RateLimitPolicy): Promise<RateLimitDecision> {
    const now = this.deps.clock.now().getTime();
    this.#sweepSometimes(now);
    const result = gcra(this.#tats.get(key), now, policy);
    if (!result.allowed)
      return Promise.resolve({
        allowed: false,
        retryAfterSeconds: retryAfterSecondsOf(result.waitMs),
      });
    this.#tats.set(key, result.tat);
    return Promise.resolve({ allowed: true });
  }

  #sweepSometimes(now: number): void {
    this.#checks += 1;
    if (this.#checks % SWEEP_EVERY !== 0) return;
    for (const [key, tat] of this.#tats) if (tat <= now) this.#tats.delete(key);
  }
}
