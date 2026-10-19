import { demoCatalogDefinition } from '../../src/contexts/catalog/adapters/inbound/demo/demo-catalog.definition.js';
import { demoCatalogSnapshot } from '../../src/contexts/catalog/adapters/inbound/demo/demo-catalog.snapshot.js';
import { QR_HOST } from './config.js';

export interface SimBranch {
  readonly key: string;
  readonly name: string;
  readonly brandKey: string;
  readonly brandName: string;
  readonly sector: string;
  readonly qrToken: string;
  /** The content of the QR code: https://{host}/q/{token}. */
  readonly qrUrl: string;
}

/**
 * The demo branches with their QR tokens. The tokens were issued once by the domain and live in the
 * committed snapshot; the API loads the same snapshot when it starts with DEMO_DATA=true, so the
 * QR content stays valid across restarts.
 */
export function simBranches(): readonly SimBranch[] {
  return demoCatalogDefinition.branches.flatMap((branch) => {
    const brand = demoCatalogDefinition.brands.find(
      (candidate) => candidate.key === branch.brandKey,
    );
    const qrToken = demoCatalogSnapshot.branches[branch.key]?.qrCodes[0]?.token;
    if (brand === undefined || qrToken === undefined) return [];
    return [
      {
        key: branch.key,
        name: branch.name,
        brandKey: brand.key,
        brandName: brand.name,
        sector: brand.sector,
        qrToken,
        qrUrl: `https://${QR_HOST}/q/${qrToken}`,
      },
    ];
  });
}
