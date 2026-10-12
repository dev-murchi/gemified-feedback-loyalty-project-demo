// Runs the Identity contracts against the in-memory adapters. S0-11 adds the user repository with a
// PostgreSQL harness under test/integration/; S0-10 (Should) the challenge store with Redis.

import { Challenge } from '../../../src/contexts/identity/domain/challenge/challenge.js';
import {
  memoryChallengeStoreHarness,
  memoryIdentityHarness,
} from '../../support/memory-identity.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';
import { challengeStoreContract } from './challenge-store.contract.js';
import { userRepositoryContract } from './user-repository.contract.js';

describe('UserRepository (in-memory)', () => {
  userRepositoryContract(memoryIdentityHarness);
});

describe('ChallengeStore (in-memory)', () => {
  challengeStoreContract(memoryChallengeStoreHarness);

  it('forgets expired challenges when a new one is saved', async () => {
    // Given a challenge that has expired
    const { store, clock } = await memoryChallengeStoreHarness();
    const random = new SequentialRandomSource();
    const expired = Challenge.issue(random, clock.now());
    await store.save(expired);
    clock.set(expired.expiresAt);

    // When another challenge is saved
    await store.save(Challenge.issue(random, clock.now()));

    // Then the expired one is gone
    expect(await store.take(expired.nonce)).toBeUndefined();
  });
});
