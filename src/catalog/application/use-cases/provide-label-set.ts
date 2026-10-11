import type { CatalogSector } from '../../public/catalog-sector.js';
import type {
  LabelSetProvider,
  LabelSetView,
} from '../../public/label-set-provider.js';
import type { LabelSetRepository } from '../ports/label-set-repository.js';

export interface ProvideLabelSetDeps {
  readonly labelSets: LabelSetRepository;
}

/** Implements the LabelSetProvider open host service: the latest label set of a sector. */
export class ProvideLabelSet implements LabelSetProvider {
  constructor(private readonly deps: ProvideLabelSetDeps) {}

  async current(sector: CatalogSector): Promise<LabelSetView> {
    const labelSet = await this.deps.labelSets.findLatest(sector);
    if (labelSet === undefined) {
      throw new Error(`No label set is defined for sector "${sector}"`);
    }
    return {
      sector,
      version: labelSet.labelSetVersion,
      topics: labelSet.topics.map((topic) => ({
        key: topic.key,
        name: topic.name,
      })),
    };
  }
}
