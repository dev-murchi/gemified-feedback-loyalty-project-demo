// Runs the Catalog repository contracts against the in-memory adapters. S0-11 adds the same
// three calls with a PostgreSQL harness under test/integration/.

import { memoryCatalogHarness } from '../../support/memory-catalog.js';
import { branchRepositoryContract } from './branch-repository.contract.js';
import { brandRepositoryContract } from './brand-repository.contract.js';
import { labelSetRepositoryContract } from './label-set-repository.contract.js';

describe('Catalog repositories (in-memory)', () => {
  describe('BranchRepository', () =>
    branchRepositoryContract(memoryCatalogHarness));
  describe('BrandRepository', () =>
    brandRepositoryContract(memoryCatalogHarness));
  describe('LabelSetRepository', () =>
    labelSetRepositoryContract(memoryCatalogHarness));
});
