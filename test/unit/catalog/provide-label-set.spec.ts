import { ProvideLabelSet } from '../../../src/contexts/catalog/application/use-cases/provide-label-set.js';
import { aLabelSet } from '../../support/catalog-builders.js';
import {
  memoryCatalogHarness,
  type CatalogHarness,
} from '../../support/memory-catalog.js';

describe('ProvideLabelSet (LabelSetProvider)', () => {
  let harness: CatalogHarness;

  beforeEach(async () => {
    harness = await memoryCatalogHarness();
  });

  it('provides the latest label set of the sector as plain data', async () => {
    // Given versions 1 and 2 of the fuel label set
    await harness.uow.run(async () => {
      await harness.labelSets.save(aLabelSet({ labelSetVersion: 1 }));
      await harness.labelSets.save(
        aLabelSet({
          labelSetVersion: 2,
          topics: [
            { key: 'pump_equipment', name: 'Pompa/ekipman' },
            { key: 'other', name: 'Diğer' },
          ],
        }),
      );
    });

    // When the current fuel label set is requested
    const view = await new ProvideLabelSet(harness).current('fuel');

    // Then version 2 is provided
    expect(view).toEqual({
      sector: 'fuel',
      version: 2,
      topics: [
        { key: 'pump_equipment', name: 'Pompa/ekipman' },
        { key: 'other', name: 'Diğer' },
      ],
    });
  });

  it('fails loudly when a sector has no label set (a setup error, not a business outcome)', async () => {
    // Given no label sets
    // When the coffee label set is requested
    const view = new ProvideLabelSet(harness).current('coffee');

    // Then it fails
    await expect(view).rejects.toThrow();
  });
});
