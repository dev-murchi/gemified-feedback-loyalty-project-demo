import { FindBranchName } from '../../../src/contexts/catalog/application/use-cases/find-branch-name.js';
import {
  aBranch,
  aBrand,
  BRANCH_ID,
  OTHER_BRANCH_ID,
} from '../../support/catalog-builders.js';
import { memoryCatalogHarness } from '../../support/memory-catalog.js';

describe('FindBranchName (BranchDirectory)', () => {
  it('gives the name of a stored branch, and nothing for an unknown one', async () => {
    // Given a stored branch
    const harness = await memoryCatalogHarness();
    const branch = aBranch();
    await harness.uow.run(async () => {
      await harness.brands.save(aBrand());
      await harness.branches.save(branch);
    });
    const directory = new FindBranchName(harness);

    // Then its name is found, and an unknown branch has none
    expect(await directory.nameOf(BRANCH_ID)).toBe(branch.name);
    expect(await directory.nameOf(OTHER_BRANCH_ID)).toBeUndefined();
  });
});
