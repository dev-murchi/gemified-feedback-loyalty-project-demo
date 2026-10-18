import { Test } from '@nestjs/testing';
import { demoCatalogSnapshot } from '../../src/contexts/catalog/adapters/inbound/demo/demo-catalog.snapshot.js';
import type { QrResolver } from '../../src/contexts/catalog/public/qr-resolver.js';
import { AppModule } from '../../src/composition/app.module.js';
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

  it('refuses to start with DEMO_DATA=true and NODE_ENV=production', async () => {
    // Given the demo flag in production
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEMO_DATA', 'true');
    // Production refuses the in-memory rate limiter too; this test is about the demo data.
    vi.stubEnv('RATE_LIMIT_DRIVER', 'redis');

    // When the application starts
    // Then it fails
    await expect(boot()).rejects.toThrow();
  });
});
