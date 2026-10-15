/** Catalog's published sector type; other contexts never see Catalog's domain types. */
export type CatalogSector = 'fuel' | 'coffee';

const SECTORS: readonly string[] = ['fuel', 'coffee'];

/** For values that crossed a boundary as plain strings (e.g. an event payload from the queue). */
export const isCatalogSector = (value: string): value is CatalogSector =>
  SECTORS.includes(value);
