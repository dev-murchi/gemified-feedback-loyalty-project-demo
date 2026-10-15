// Runs the Insights repository contract against the in-memory adapter. S0-11 adds the same call
// with a PostgreSQL harness under test/integration/.

import { memoryInsightsHarness } from '../../support/memory-insights.js';
import { b2bClientRepositoryContract } from './b2b-client-repository.contract.js';

describe('B2bClientRepository (in-memory)', () => {
  b2bClientRepositoryContract(memoryInsightsHarness);
});
