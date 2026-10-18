import { RedisChallengeStore } from '../../src/contexts/identity/adapters/outbound/redis-challenge.store.js';
import { createFailFastRedis } from '../../src/platform/redis/fail-fast-redis.js';
import { FakeClock } from './fake-clock.js';
import type {
  ChallengeStoreHarness,
  ChallengeStoreOptions,
} from './memory-identity.js';
import { freshPrefix, type TestRedis } from './redis.js';

/** One API instance's store: its own connection, the given clock and key prefix. */
export function redisChallengeStore(
  redis: TestRedis,
  deps: { clock: FakeClock; prefix: string; maxLive?: number },
): RedisChallengeStore {
  return new RedisChallengeStore({
    client: createFailFastRedis(redis.connection),
    ...deps,
  });
}

/** The Redis counterpart of memoryChallengeStoreHarness: same shape, a key prefix of its own. */
export function redisChallengeStoreHarness(
  redis: TestRedis,
  options: ChallengeStoreOptions = {},
): Promise<ChallengeStoreHarness> {
  const clock = new FakeClock();
  const store = redisChallengeStore(redis, {
    clock,
    prefix: freshPrefix(),
    ...options,
  });
  return Promise.resolve({ store, clock, dispose: () => store.close() });
}
