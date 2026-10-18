// The ChallengeStore contracts (docs/06 §5.1, T-S4) against Redis (Testcontainers); the in-memory
// store runs the same cases in test/contract/identity.

import { challengeStoreCapContract } from '../../contract/identity/challenge-store-cap.contract.js';
import { challengeStoreContract } from '../../contract/identity/challenge-store.contract.js';
import { redisChallengeStoreHarness } from '../../support/redis-challenge-store.js';
import { freshRedis, type TestRedis } from '../../support/redis.js';

describe('ChallengeStore (Redis)', () => {
  let redis: TestRedis;

  beforeAll(async () => {
    redis = await freshRedis();
  });

  afterAll(() => redis.release());

  const harness = (options?: { maxLive?: number }) =>
    redisChallengeStoreHarness(redis, options);

  challengeStoreContract(harness);
  challengeStoreCapContract(harness);
});
