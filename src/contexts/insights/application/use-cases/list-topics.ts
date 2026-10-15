import type { BrandId } from '../../../../shared-kernel/ids.js';
import type { LabelSetProvider } from '../../../catalog/public/label-set-provider.js';
import type { CatalogSector } from '../../../catalog/public/catalog-sector.js';
import type { ReportingQueries } from '../ports/reporting-queries.js';

/** The contract's `TopicList`. */
export interface TopicListView {
  readonly sector: CatalogSector;
  readonly labelSetVersion: number;
  readonly items: readonly { readonly key: string; readonly name: string }[];
}

/** GET /v1/b2b/topics: the current topic keys and names of the brand's sector, for filters. */
export class ListTopics {
  constructor(
    private readonly deps: {
      readonly reporting: ReportingQueries;
      readonly labelSets: LabelSetProvider;
    },
  ) {}

  async execute(query: { readonly brandId: BrandId }): Promise<TopicListView> {
    const sector = await this.deps.reporting.sectorOf(query.brandId);
    if (sector === undefined)
      throw new Error(`Brand ${query.brandId} has no sector`);
    const labelSet = await this.deps.labelSets.current(sector);
    return {
      sector,
      labelSetVersion: labelSet.version,
      items: labelSet.topics.map((topic) => ({
        key: topic.key,
        name: topic.name,
      })),
    };
  }
}
