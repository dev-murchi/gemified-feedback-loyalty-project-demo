import type { BrandId } from '../../../../../shared-kernel/ids.js';
import type { UnitOfWork } from '../../../../../shared-kernel/unit-of-work.js';
import type { B2bClientRepository } from '../../../application/ports/b2b-client-repository.js';
import type { SecretHasher } from '../../../application/ports/secret-hasher.js';
import { B2bClient } from '../../../domain/b2b-client/b2b-client.js';
import { parseScopes, type Scope } from '../../../domain/scope.js';

/** At least this many characters: a demo secret must not be guessable either (owner decision 1). */
export const MIN_SECRET_LENGTH = 32;

/** One entry of B2B_DEMO_CLIENTS. `brand` is a demo brand key (`fuel`, `coffee`). */
interface DemoClientEntry {
  readonly clientId: string;
  readonly brand: string;
  readonly secret: string;
  readonly scope: string;
}

export interface DemoClient {
  readonly clientId: string;
  readonly brandId: BrandId;
  readonly secret: string;
  readonly scopes: readonly Scope[];
}

const isEntry = (value: unknown): value is DemoClientEntry =>
  typeof value === 'object' &&
  value !== null &&
  ['clientId', 'brand', 'secret', 'scope'].every(
    (key) => typeof (value as Record<string, unknown>)[key] === 'string',
  );

function toClient(
  entry: DemoClientEntry,
  brands: Readonly<Record<string, BrandId>>,
): DemoClient {
  const brandId = brands[entry.brand];
  if (brandId === undefined)
    throw new Error(`B2B_DEMO_CLIENTS: unknown demo brand "${entry.brand}"`);
  if (entry.secret.length < MIN_SECRET_LENGTH)
    throw new Error(
      `B2B_DEMO_CLIENTS: the secret of "${entry.clientId}" must be at least ${MIN_SECRET_LENGTH} characters`,
    );
  const scopes = parseScopes(entry.scope);
  if (scopes === undefined || scopes.length === 0)
    throw new Error(`B2B_DEMO_CLIENTS: "${entry.clientId}" needs known scopes`);
  return { clientId: entry.clientId, brandId, secret: entry.secret, scopes };
}

/**
 * Reads B2B_DEMO_CLIENTS: a JSON array of `{ clientId, brand, secret, scope }` (owner decision 1 of
 * S0-09: secrets come from the environment, never from git). Anything malformed stops start-up
 * with a message that names the field, never the secret.
 */
export function parseDemoClients(
  json: string,
  brands: Readonly<Record<string, BrandId>>,
): DemoClient[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('B2B_DEMO_CLIENTS is not valid JSON');
  }
  if (!Array.isArray(parsed) || !parsed.every(isEntry))
    throw new Error(
      'B2B_DEMO_CLIENTS must be an array of { clientId, brand, secret, scope }',
    );
  return parsed.map((entry) => toClient(entry, brands));
}

/** Stores the demo clients with hashed secrets, in one unit of work; the plain secret is dropped. */
export async function seedDemoClients(
  deps: {
    readonly clients: B2bClientRepository;
    readonly hasher: SecretHasher;
    readonly uow: UnitOfWork;
  },
  demoClients: readonly DemoClient[],
): Promise<void> {
  const clients = await Promise.all(
    demoClients.map(async (demo) =>
      B2bClient.create({
        clientId: demo.clientId,
        brandId: demo.brandId,
        secretHash: await deps.hasher.hash(demo.secret),
        scopes: demo.scopes,
        expiresAt: null,
      }),
    ),
  );
  await deps.uow.run(async () => {
    for (const client of clients) await deps.clients.save(client);
  });
}
