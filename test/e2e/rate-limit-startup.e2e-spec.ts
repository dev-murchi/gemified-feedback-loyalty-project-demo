// S0-10 slice 5: the start-up rules of the rate limiter. Production needs a limiter shared by all
// API instances, like it needs real attestation and no demo data.

import { Test } from '@nestjs/testing';
import { PersistenceModule } from '../../src/composition/persistence.module.js';
import { RateLimitModule } from '../../src/composition/rate-limit.module.js';

describe('rate limiter start-up', () => {
  afterEach(() => vi.unstubAllEnvs());

  const boot = () =>
    Test.createTestingModule({
      imports: [PersistenceModule, RateLimitModule],
    }).compile();

  it.each([undefined, 'memory'])(
    'refuses to start in production with RATE_LIMIT_DRIVER=%s',
    async (driver) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('RATE_LIMIT_DRIVER', driver ?? '');

      await expect(boot()).rejects.toThrow(
        /RATE_LIMIT_DRIVER=memory is not allowed when NODE_ENV=production/,
      );
    },
  );

  it('starts in production with RATE_LIMIT_DRIVER=redis, without needing Redis to be up yet', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('RATE_LIMIT_DRIVER', 'redis');
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:1');

    const module = await boot();

    await module.close();
  });
});
