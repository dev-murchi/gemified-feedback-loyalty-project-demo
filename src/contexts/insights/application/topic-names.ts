import type { BrandId } from '../../../shared-kernel/ids.js';
import type { LabelSetProvider } from '../../catalog/public/label-set-provider.js';
import type { ReportingQueries } from './ports/reporting-queries.js';

export interface NamedTopic {
  readonly key: string;
  readonly name: string;
}

/**
 * Names topic keys with the brand sector's current label set. A key from an older label set that
 * the current one no longer has keeps its key as its name, so a report never loses a topic.
 */
export async function topicNamesFor(
  deps: {
    readonly reporting: ReportingQueries;
    readonly labelSets: LabelSetProvider;
  },
  brandId: BrandId,
): Promise<(key: string) => NamedTopic> {
  const sector = await deps.reporting.sectorOf(brandId);
  if (sector === undefined) throw new Error(`Brand ${brandId} has no sector`);
  const labelSet = await deps.labelSets.current(sector);
  const names = new Map(
    labelSet.topics.map((topic) => [topic.key, topic.name]),
  );
  return (key) => ({ key, name: names.get(key) ?? key });
}
