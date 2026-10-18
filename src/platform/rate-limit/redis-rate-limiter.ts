import type { Redis } from 'ioredis';
import type { Clock } from '../../shared-kernel/clock.js';
import { closeRedis, connectionSettled } from '../redis/fail-fast-redis.js';
import { EPSILON_MS, retryAfterSecondsOf } from './gcra.js';
import type {
  RateLimitDecision,
  RateLimitPolicy,
  RateLimiter,
} from './rate-limiter.js';

/**
 * GCRA as one atomic Redis script (ADR-016), the same arithmetic as gcra.ts; the contract tests
 * run both against the same cases. The state is one number per key: the "theoretical arrival time".
 * The key expires when it would be equal to an absent key anyway (the caller is idle).
 * Replies: {1, 0} allowed; {0, waitMs} refused.
 */
const GCRA_SCRIPT = `
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local epsilon = tonumber(ARGV[4])
local tat = tonumber(redis.call('GET', KEYS[1]))
if tat == nil or tat < now then tat = now end
local new_tat = tat + interval
local wait = new_tat - burst * interval - now
if wait > epsilon then
  return {0, math.ceil(wait)}
end
redis.call('SET', KEYS[1], string.format('%.3f', new_tat), 'PX', math.ceil(new_tat - now))
return {1, 0}
`;

interface GcraCommand {
  gcra(
    key: string,
    now: number,
    interval: number,
    burst: number,
    epsilon: number,
  ): Promise<unknown>;
}

export interface RedisRateLimiterDeps {
  readonly client: Redis;
  readonly clock: Clock;
  /** Put before every key; tests sharing one Redis use their own. */
  readonly prefix?: string;
}

/** The limiter every API instance shares: the state lives in Redis, so two instances count together. */
export class RedisRateLimiter implements RateLimiter {
  readonly #command: GcraCommand;

  constructor(private readonly deps: RedisRateLimiterDeps) {
    deps.client.defineCommand('gcra', { numberOfKeys: 1, lua: GCRA_SCRIPT });
    this.#command = deps.client as unknown as GcraCommand;
  }

  async check(
    key: string,
    policy: RateLimitPolicy,
  ): Promise<RateLimitDecision> {
    await connectionSettled(this.deps.client);
    const reply = await this.#command.gcra(
      `${this.deps.prefix ?? ''}${key}`,
      this.deps.clock.now().getTime(),
      60_000 / policy.perMinute,
      policy.burst,
      EPSILON_MS,
    );
    return decisionOf(reply);
  }

  close(): Promise<void> {
    return closeRedis(this.deps.client);
  }
}

function decisionOf(reply: unknown): RateLimitDecision {
  if (!Array.isArray(reply) || typeof reply[0] !== 'number')
    throw new Error('Unexpected reply from the rate limit script');
  if (reply[0] === 1) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: retryAfterSecondsOf(Number(reply[1])),
  };
}
