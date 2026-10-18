// Runs the Identity contracts against the in-memory adapters. S0-11 adds the user repository with a
// PostgreSQL harness under test/integration/. test/integration/challenge-store runs the
// ChallengeStore contracts against Redis.

import {
  memoryChallengeStoreHarness,
  memoryIdentityHarness,
} from '../../support/memory-identity.js';
import { challengeStoreCapContract } from './challenge-store-cap.contract.js';
import { challengeStoreContract } from './challenge-store.contract.js';
import { userRepositoryContract } from './user-repository.contract.js';

describe('UserRepository (in-memory)', () => {
  userRepositoryContract(memoryIdentityHarness);
});

describe('ChallengeStore (in-memory)', () => {
  challengeStoreContract(memoryChallengeStoreHarness);
  challengeStoreCapContract(memoryChallengeStoreHarness);
});
