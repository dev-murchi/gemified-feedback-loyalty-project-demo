// Runs the Feedback repository contracts against the in-memory adapters. S0-11 adds the same calls
// with a PostgreSQL harness under test/integration/.

import { memoryFeedbackHarness } from '../../support/memory-feedback.js';
import { feedbackRepositoryContract } from './feedback-repository.contract.js';
import { rewardCooldownRepositoryContract } from './reward-cooldown-repository.contract.js';

describe('RewardCooldownRepository (in-memory)', () => {
  rewardCooldownRepositoryContract(memoryFeedbackHarness);
});

describe('FeedbackRepository (in-memory)', () => {
  feedbackRepositoryContract(memoryFeedbackHarness);
});
