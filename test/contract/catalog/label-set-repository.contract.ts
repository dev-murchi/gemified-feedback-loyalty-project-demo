import { aLabelSet } from '../../support/catalog-builders.js';
import type { CatalogHarness } from '../../support/memory-catalog.js';
import { versionedRepositoryContract } from '../support/versioned-repository.contract.js';

export function labelSetRepositoryContract(
  makeHarness: () => Promise<CatalogHarness>,
): void {
  describe('versioning', () => {
    versionedRepositoryContract(async () => {
      const harness = await makeHarness();
      return {
        uow: harness.uow,
        newAggregate: () => aLabelSet(),
        save: (labelSet) => harness.labelSets.save(labelSet),
        load: () => harness.labelSets.findLatest('fuel'),
        dispose: () => harness.dispose(),
      };
    });
  });

  describe('storage', () => {
    let harness: CatalogHarness;

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(() => harness.dispose());

    it('returns the highest version of the sector, with its topics', async () => {
      // Given versions 1 and 2 for fuel and version 3 for coffee
      const latest = aLabelSet({
        labelSetVersion: 2,
        topics: [
          { key: 'wait_time', name: 'Bekleme süresi' },
          { key: 'other', name: 'Diğer' },
        ],
      });
      await harness.uow.run(async () => {
        await harness.labelSets.save(aLabelSet({ labelSetVersion: 1 }));
        await harness.labelSets.save(latest);
        await harness.labelSets.save(
          aLabelSet({ sector: 'coffee', labelSetVersion: 3 }),
        );
      });

      // When the latest fuel label set is loaded
      const loaded = await harness.labelSets.findLatest('fuel');

      // Then it is version 2 with exactly its topics
      expect(loaded?.labelSetVersion).toBe(2);
      expect(loaded?.topics).toEqual(latest.topics);
    });

    it('finds nothing for a sector without a label set', async () => {
      // Given an empty store
      // When the latest coffee label set is loaded
      const loaded = await harness.labelSets.findLatest('coffee');

      // Then nothing is found
      expect(loaded).toBeUndefined();
    });
  });
}
