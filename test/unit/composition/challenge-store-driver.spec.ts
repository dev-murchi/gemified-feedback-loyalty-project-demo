import {
  challengeStoreDriverOf,
  createChallengeStore,
} from '../../../src/composition/challenge-store-driver.js';
import { MemoryChallengeStore } from '../../../src/contexts/identity/adapters/outbound/memory-challenge.store.js';
import { FakeClock } from '../../support/fake-clock.js';
import { RecordingLogger } from '../../support/recording-logger.js';

describe('challengeStoreDriverOf (CHALLENGE_STORE_DRIVER, SDD 9.1)', () => {
  it.each([undefined, '', 'memory'])(
    'uses the in-memory store when CHALLENGE_STORE_DRIVER is %s outside production',
    (driver) => {
      expect(challengeStoreDriverOf({ CHALLENGE_STORE_DRIVER: driver })).toBe(
        'memory',
      );
    },
  );

  it('uses Redis when asked to', () => {
    expect(challengeStoreDriverOf({ CHALLENGE_STORE_DRIVER: 'redis' })).toBe(
      'redis',
    );
  });

  it('refuses an unknown driver at start-up', () => {
    expect(() =>
      challengeStoreDriverOf({ CHALLENGE_STORE_DRIVER: 'memcached' }),
    ).toThrow('Unknown CHALLENGE_STORE_DRIVER "memcached"');
  });

  describe('in production', () => {
    it.each([undefined, '', 'memory'])(
      'refuses CHALLENGE_STORE_DRIVER=%s: a challenge issued by one instance would be unknown to another',
      (driver) => {
        expect(() =>
          challengeStoreDriverOf({
            NODE_ENV: 'production',
            CHALLENGE_STORE_DRIVER: driver,
          }),
        ).toThrow(
          'CHALLENGE_STORE_DRIVER=memory is not allowed when NODE_ENV=production',
        );
      },
    );

    it('starts with CHALLENGE_STORE_DRIVER=redis', () => {
      expect(
        challengeStoreDriverOf({
          NODE_ENV: 'production',
          CHALLENGE_STORE_DRIVER: 'redis',
        }),
      ).toBe('redis');
    });
  });
});

describe('createChallengeStore', () => {
  const deps = () => ({
    clock: new FakeClock(),
    logger: new RecordingLogger(),
  });

  it('builds the in-memory store by default', () => {
    expect(createChallengeStore({}, deps())).toBeInstanceOf(
      MemoryChallengeStore,
    );
  });

  it('builds a Redis store that opens no connection until it is used, and closes cleanly', async () => {
    // Given the Redis driver pointing at nothing
    const store = createChallengeStore(
      { CHALLENGE_STORE_DRIVER: 'redis', REDIS_URL: 'redis://127.0.0.1:1' },
      deps(),
    );

    // When the application stops without a single request
    // Then there is nothing to wait for
    await expect(store.onModuleDestroy?.()).resolves.toBeUndefined();
  });

  it('refuses the in-memory store in production before building anything', () => {
    expect(() =>
      createChallengeStore({ NODE_ENV: 'production' }, deps()),
    ).toThrow('CHALLENGE_STORE_DRIVER=memory is not allowed');
  });
});
