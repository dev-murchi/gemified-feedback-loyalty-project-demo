import { Test } from '@nestjs/testing';
import { demoCatalogSnapshot } from '../../src/contexts/catalog/adapters/inbound/demo/demo-catalog.snapshot.js';
import type { QrResolver } from '../../src/contexts/catalog/public/qr-resolver.js';
import { AppModule } from '../../src/composition/app.module.js';
import { CatalogModule } from '../../src/composition/catalog.module.js';
import { PersistenceModule } from '../../src/composition/persistence.module.js';
import { QR_RESOLVER } from '../../src/composition/tokens.js';

const firstDemoToken = (): string =>
  Object.values(demoCatalogSnapshot.branches)[0]?.qrCodes[0]?.token ?? '';

const boot = () => Test.createTestingModule({ imports: [AppModule] }).compile();

describe('demo catalog wiring (e2e)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads the demo catalog when DEMO_DATA=true', async () => {
    // Given the demo flag outside production
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEMO_DATA', 'true');

    // When the application starts
    const app = await boot();

    // Then a demo QR token resolves
    const resolver = app.get<QrResolver>(QR_RESOLVER);
    expect((await resolver.resolve(firstDemoToken())).ok).toBe(true);
    await app.close();
  });

  it('does not load demo data without the flag', async () => {
    // Given no demo flag
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEMO_DATA', '');

    // When the application starts
    const app = await boot();

    // Then the demo QR token is unknown
    const resolver = app.get<QrResolver>(QR_RESOLVER);
    expect((await resolver.resolve(firstDemoToken())).ok).toBe(false);
    await app.close();
  });

  // The whole application cannot start in production yet (the development verifiers refuse first,
  // TC-AUTH-09), so the catalog module is started alone: only its own demo-data rule can refuse.
  const bootCatalog = () =>
    Test.createTestingModule({
      imports: [PersistenceModule, CatalogModule],
    }).compile();

  it('refuses to start with DEMO_DATA=true and NODE_ENV=production', async () => {
    // Given the demo flag in production
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_DATA', 'true');

    // When the catalog starts
    // Then it fails, and because of the demo data
    await expect(bootCatalog()).rejects.toThrow(
      'DEMO_DATA=true is not allowed when NODE_ENV=production',
    );
  });

  it('starts in production without the flag, so the refusal above is the demo-data rule alone', async () => {
    // Given production without the demo flag
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_DATA', '');

    // When the catalog starts
    const module = await bootCatalog();

    // Then it starts, with no demo data
    const resolver = module.get<QrResolver>(QR_RESOLVER);
    expect((await resolver.resolve(firstDemoToken())).ok).toBe(false);
    await module.close();
  });
});
