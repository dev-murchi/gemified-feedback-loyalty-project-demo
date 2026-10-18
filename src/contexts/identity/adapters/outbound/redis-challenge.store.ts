import type { Redis } from 'ioredis';
import type { Clock } from '../../../../shared-kernel/clock.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import {
  closeRedis,
  connectionSettled,
} from '../../../../platform/redis/fail-fast-redis.js';
import type { ChallengeStore } from '../../application/ports/challenge-store.js';
import type { TooManyChallenges } from '../../domain/challenge/challenge-errors.js';
import type { Challenge } from '../../domain/challenge/challenge.js';
import type { Nonce } from '../../domain/challenge/nonce.js';
import { DEFAULT_MAX_LIVE_CHALLENGES } from './memory-challenge.store.js';

/**
 * Saves a challenge unless the cap is reached, in one atomic step, so two API instances can never
 * overshoot it. KEYS[1] is the index of waiting challenges (a sorted set: nonce by expiry time),
 * KEYS[2] the challenge itself. When the index is full, challenges that have expired are dropped
 * from it first; only if it is still full the save is refused and the earliest expiry returned.
 * Replies: {1, 0} saved; {0, earliestExpiryMs} full.
 */
const SAVE_SCRIPT = `
local now = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local expires_at = ARGV[3]
local ttl = tonumber(ARGV[4])
if redis.call('ZCARD', KEYS[1]) >= max then
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
end
if redis.call('ZCARD', KEYS[1]) >= max then
  local earliest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, tonumber(earliest[2])}
end
redis.call('SET', KEYS[2], expires_at, 'PX', ttl)
redis.call('ZADD', KEYS[1], expires_at, ARGV[5])
redis.call('PEXPIRE', KEYS[1], ttl)
return {1, 0}
`;

interface SaveCommand {
  saveChallenge(
    index: string,
    challenge: string,
    now: number,
    max: number,
    expiresAt: number,
    ttl: number,
    nonce: string,
  ): Promise<unknown>;
}

export interface RedisChallengeStoreDeps {
  readonly client: Redis;
  /** Used for the expiry arithmetic; the expiry rule itself is `Challenge.isLiveAt`. */
  readonly clock: Clock;
  /** The most challenges kept at once, across all API instances; DEFAULT_MAX_LIVE_CHALLENGES if omitted. */
  readonly maxLive?: number;
  /** Put before every key; tests sharing one Redis use their own. */
  readonly prefix?: string;
}

/**
 * Challenges in Redis, shared by every API instance (SDD 9.1: a challenge issued by one instance
 * must be usable on another). A challenge is one key holding its expiry time, with a Redis expiry
 * of its own lifetime (60 s), so Redis forgets it. Taking is GETDEL, one atomic step: two requests
 * can never both get it (T-S4). The cap on waiting challenges bounds the memory the unauthenticated
 * challenge endpoint can use; it is counted in an index of the waiting ones.
 *
 * Redis errors are thrown, not hidden: a challenge that cannot be stored cannot be verified later,
 * so the endpoint answers 500 instead of handing out a nonce that will never work.
 */
export class RedisChallengeStore implements ChallengeStore {
  readonly #maxLive: number;
  readonly #prefix: string;
  readonly #command: SaveCommand;

  constructor(private readonly deps: RedisChallengeStoreDeps) {
    this.#maxLive = deps.maxLive ?? DEFAULT_MAX_LIVE_CHALLENGES;
    this.#prefix = deps.prefix ?? '';
    deps.client.defineCommand('saveChallenge', {
      numberOfKeys: 2,
      lua: SAVE_SCRIPT,
    });
    this.#command = deps.client as unknown as SaveCommand;
  }

  async save(challenge: Challenge): Promise<Result<void, TooManyChallenges>> {
    await connectionSettled(this.deps.client);
    const now = this.deps.clock.now().getTime();
    const expiresAt = challenge.expiresAt.getTime();
    const reply = await this.#command.saveChallenge(
      this.#indexKey(),
      this.#keyOf(challenge.nonce),
      now,
      this.#maxLive,
      expiresAt,
      Math.max(1, expiresAt - now),
      challenge.nonce,
    );
    return this.#resultOf(reply, now);
  }

  async take(nonce: Nonce): Promise<Challenge | undefined> {
    await connectionSettled(this.deps.client);
    const stored = await this.deps.client.getdel(this.#keyOf(nonce));
    if (stored === null) return undefined;
    // The index entry is only a counter for the cap. If removing it fails, the challenge is
    // already used (the GETDEL above), so the request goes on; the entry goes away at its expiry.
    await this.deps.client.zrem(this.#indexKey(), nonce).catch(() => undefined);
    const expiresAt = Number(stored);
    return Number.isFinite(expiresAt)
      ? { nonce, expiresAt: new Date(expiresAt) }
      : undefined;
  }

  close(): Promise<void> {
    return closeRedis(this.deps.client);
  }

  #keyOf(nonce: string): string {
    return `${this.#prefix}challenge:${nonce}`;
  }

  #indexKey(): string {
    return `${this.#prefix}challenges:waiting`;
  }

  /** The caller may try again when the earliest waiting challenge has expired. */
  #resultOf(reply: unknown, now: number): Result<void, TooManyChallenges> {
    if (!Array.isArray(reply) || typeof reply[0] !== 'number')
      throw new Error('Unexpected reply from the challenge store script');
    if (reply[0] === 1) return ok(undefined);
    return err({
      code: 'RATE_LIMITED',
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((Number(reply[1]) - now) / 1000),
      ),
    });
  }
}
