import { Branch } from '../../../src/catalog/domain/branch/branch.js';
import type { QrToken } from '../../../src/catalog/domain/branch/qr-token.js';
import type { BranchId } from '../../../src/shared-kernel/ids.js';
import {
  aBranch,
  BRANCH_ID,
  OTHER_BRANCH_ID,
} from '../../support/catalog-builders.js';
import type { CatalogHarness } from '../../support/memory-catalog.js';
import { versionedRepositoryContract } from '../support/versioned-repository.contract.js';

const REVOKED_AT = new Date('2026-10-12T10:00:00.000Z');

/** Everything a stored branch must give back, compared as plain data. */
const stateOf = (branch: Branch | undefined) =>
  branch && {
    id: branch.id,
    brandId: branch.brandId,
    name: branch.name,
    location: branch.location,
    qrCodes: branch.qrCodes,
  };

const tokenOf = (branch: Branch, index = 0): QrToken => {
  const code = branch.qrCodes[index];
  if (code === undefined) throw new Error('branch has no such QR code');
  return code.token;
};

export function branchRepositoryContract(
  makeHarness: () => Promise<CatalogHarness>,
): void {
  describe('versioning', () => {
    versionedRepositoryContract(async () => {
      const harness = await makeHarness();
      return {
        uow: harness.uow,
        newAggregate: () => aBranch(),
        save: (branch) => harness.branches.save(branch),
        load: () => harness.branches.findById(BRANCH_ID),
        dispose: () => harness.dispose(),
      };
    });
  });

  describe('storage', () => {
    let harness: CatalogHarness;
    const save = (branch: Branch) =>
      harness.uow.run(() => harness.branches.save(branch));

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(() => harness.dispose());

    it('loads exactly what was saved, QR codes and dates included', async () => {
      // Given a branch with an active and a revoked QR code
      const branch = aBranch({ qrCodes: 2 });
      branch.revokeQrCode(tokenOf(branch), REVOKED_AT);

      // When it is saved and loaded
      await save(branch);
      const loaded = await harness.branches.findById(BRANCH_ID);

      // Then the loaded branch has the same state
      expect(stateOf(loaded)).toEqual(stateOf(branch));
    });

    it('finds a branch by any of its QR tokens, active or revoked', async () => {
      // Given a stored branch whose first QR code is revoked
      const branch = aBranch({ qrCodes: 2 });
      branch.revokeQrCode(tokenOf(branch), REVOKED_AT);
      await save(branch);

      // When it is looked up by each token
      const byRevoked = await harness.branches.findByQrToken(
        tokenOf(branch, 0),
      );
      const byActive = await harness.branches.findByQrToken(tokenOf(branch, 1));

      // Then both find the branch
      expect(byRevoked?.id).toBe(BRANCH_ID);
      expect(byActive?.id).toBe(BRANCH_ID);
    });

    it('finds nothing for an unknown id or token', async () => {
      // Given a stored branch
      await save(aBranch());

      // When an unknown id and an unknown token are looked up
      const byId = await harness.branches.findById(
        'c0000000-0000-4000-8000-0000000000ff' as BranchId,
      );
      const byToken = await harness.branches.findByQrToken(
        'unknown-token-unknown-token' as QrToken,
      );

      // Then nothing is found
      expect(byId).toBeUndefined();
      expect(byToken).toBeUndefined();
    });

    it('does not store a change to a loaded branch until it is saved', async () => {
      // Given a stored branch with one active QR code
      const branch = aBranch();
      await save(branch);

      // When a loaded copy revokes the code but is not saved
      const loaded = await harness.branches.findById(BRANCH_ID);
      loaded?.revokeQrCode(tokenOf(branch), REVOKED_AT);

      // Then the stored branch still accepts the token
      const reloaded = await harness.branches.findById(BRANCH_ID);
      expect(reloaded?.accepts(tokenOf(branch))).toBe(true);
    });

    it('rejects a QR token that already belongs to another branch', async () => {
      // Given a stored branch
      const branch = aBranch();
      await save(branch);

      // When another branch is saved with the same QR code token
      const copy = Branch.reconstitute(
        {
          id: OTHER_BRANCH_ID,
          brandId: branch.brandId,
          name: 'Another branch',
          location: branch.location,
          qrCodes: branch.qrCodes,
        },
        0,
      );
      const run = save(copy);

      // Then the save fails (unique token, G-3)
      await expect(run).rejects.toThrow();
    });
  });
}
