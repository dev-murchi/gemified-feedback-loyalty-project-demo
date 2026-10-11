import type { BrandId } from '../../../src/shared-kernel/ids.js';
import { aBrand, BRAND_ID } from '../../support/catalog-builders.js';
import type { CatalogHarness } from '../../support/memory-catalog.js';
import { versionedRepositoryContract } from '../support/versioned-repository.contract.js';

export function brandRepositoryContract(
  makeHarness: () => Promise<CatalogHarness>,
): void {
  describe('versioning', () => {
    versionedRepositoryContract(async () => {
      const harness = await makeHarness();
      return {
        uow: harness.uow,
        newAggregate: () => aBrand(),
        save: (brand) => harness.brands.save(brand),
        load: () => harness.brands.findById(BRAND_ID),
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

    it('loads exactly what was saved', async () => {
      // Given a coffee brand
      const brand = aBrand({ name: 'Örnek Kahve', sector: 'coffee' });

      // When it is saved and loaded
      await harness.uow.run(() => harness.brands.save(brand));
      const loaded = await harness.brands.findById(BRAND_ID);

      // Then the loaded brand has the same state
      expect({
        id: loaded?.id,
        name: loaded?.name,
        sector: loaded?.sector,
      }).toEqual({
        id: BRAND_ID,
        name: 'Örnek Kahve',
        sector: 'coffee',
      });
    });

    it('finds nothing for an unknown id', async () => {
      // Given an empty store
      // When an unknown id is looked up
      const loaded = await harness.brands.findById(
        'b0000000-0000-4000-8000-0000000000ff' as BrandId,
      );

      // Then nothing is found
      expect(loaded).toBeUndefined();
    });
  });
}
