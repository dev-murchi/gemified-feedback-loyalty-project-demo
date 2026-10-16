import { demoCatalogSnapshot } from '../contexts/catalog/adapters/inbound/demo/demo-catalog.snapshot.js';
import {
  parseDemoClients,
  seedDemoClients,
} from '../contexts/insights/adapters/inbound/demo/demo-b2b-clients.js';
import type { B2bClientRepository } from '../contexts/insights/application/ports/b2b-client-repository.js';
import type { SecretHasher } from '../contexts/insights/application/ports/secret-hasher.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { BrandId } from '../shared-kernel/ids.js';
import type { UnitOfWork } from '../shared-kernel/unit-of-work.js';
import { isDemoDataEnabled, type Environment } from './demo-data.js';

/** The demo brands by key (`fuel`, `coffee`), from the committed demo catalog snapshot. */
const demoBrandIds = (): Record<string, BrandId> =>
  Object.fromEntries(
    Object.entries(demoCatalogSnapshot.brands).map(([key, brand]) => [
      key,
      brand.id as BrandId,
    ]),
  );

/**
 * Creates the demo B2B clients from B2B_DEMO_CLIENTS (owner decision 1 of S0-09). They belong to the
 * demo brands, so they need DEMO_DATA=true, and like all demo data they are refused with
 * NODE_ENV=production. Without the variable there are no clients.
 */
export async function loadDemoB2bClients(
  env: Environment,
  deps: {
    readonly clients: B2bClientRepository;
    readonly hasher: SecretHasher;
    readonly uow: UnitOfWork;
    readonly clock: Clock;
  },
): Promise<{ readonly loaded: number }> {
  const json = env['B2B_DEMO_CLIENTS'];
  if (json === undefined || json === '') return { loaded: 0 };
  if (env['NODE_ENV'] === 'production')
    throw new Error('B2B_DEMO_CLIENTS is not allowed when NODE_ENV=production');
  if (!isDemoDataEnabled(env))
    throw new Error(
      'B2B_DEMO_CLIENTS needs DEMO_DATA=true: its clients belong to the demo brands',
    );
  const demoClients = parseDemoClients(json, {
    brands: demoBrandIds(),
    now: deps.clock.now(),
  });
  await seedDemoClients(deps, demoClients);
  return { loaded: demoClients.length };
}
