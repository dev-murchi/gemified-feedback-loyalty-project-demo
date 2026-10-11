import type { CatalogSector } from './catalog-sector.js';

export interface LabelSetView {
  readonly sector: CatalogSector;
  readonly version: number;
  readonly topics: readonly { readonly key: string; readonly name: string }[];
}

/** Open host service (docs/06 §3, §5.2): the current topic list of a sector, for Analysis. */
export interface LabelSetProvider {
  current(sector: CatalogSector): Promise<LabelSetView>;
}
