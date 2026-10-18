import {
  rateLimitConfigFrom,
  rateLimitDriverOf,
} from '../../../src/composition/rate-limit-config.js';

describe('rateLimitConfigFrom (owner decisions of 17 Oct 2026)', () => {
  it('defaults to 120/min burst 30 per device, 600/min burst 100 per B2B client, 300/min burst 100 per IP', () => {
    const config = rateLimitConfigFrom({});

    expect(config.policies).toEqual({
      device: { perMinute: 120, burst: 30 },
      client: { perMinute: 600, burst: 100 },
      ip: { perMinute: 300, burst: 100 },
    });
  });

  it('ignores X-Forwarded-For by default (0 trusted proxies) and uses the local Redis', () => {
    const config = rateLimitConfigFrom({ TRUST_PROXY_HOPS: '' });

    expect(config.trustProxyHops).toBe(0);
    expect(config.redisUrl).toBe('redis://localhost:6379');
    expect(config.driver).toBe('memory');
  });

  it('reads every value from the environment', () => {
    const config = rateLimitConfigFrom({
      RATE_LIMIT_DRIVER: 'redis',
      RATE_LIMIT_DEVICE_PER_MINUTE: '60',
      RATE_LIMIT_DEVICE_BURST: '10',
      RATE_LIMIT_CLIENT_PER_MINUTE: '1200',
      RATE_LIMIT_CLIENT_BURST: '200',
      RATE_LIMIT_IP_PER_MINUTE: '30',
      RATE_LIMIT_IP_BURST: '5',
      TRUST_PROXY_HOPS: '2',
      REDIS_URL: 'redis://cache:6380',
    });

    expect(config).toEqual({
      driver: 'redis',
      policies: {
        device: { perMinute: 60, burst: 10 },
        client: { perMinute: 1200, burst: 200 },
        ip: { perMinute: 30, burst: 5 },
      },
      trustProxyHops: 2,
      redisUrl: 'redis://cache:6380',
    });
  });

  it.each([
    ['RATE_LIMIT_DEVICE_PER_MINUTE', '0'],
    ['RATE_LIMIT_DEVICE_BURST', 'many'],
    ['RATE_LIMIT_CLIENT_PER_MINUTE', '1.5'],
    ['RATE_LIMIT_CLIENT_BURST', '-3'],
    ['RATE_LIMIT_IP_PER_MINUTE', '1e3'],
    ['RATE_LIMIT_IP_BURST', '0'],
    ['TRUST_PROXY_HOPS', '-1'],
  ])(
    'refuses %s=%s at start-up instead of running without a limit',
    (name, value) => {
      expect(() => rateLimitConfigFrom({ [name]: value })).toThrow(name);
    },
  );

  it('refuses an unknown driver at start-up', () => {
    expect(() => rateLimitDriverOf({ RATE_LIMIT_DRIVER: 'memcached' })).toThrow(
      'Unknown RATE_LIMIT_DRIVER "memcached"',
    );
  });

  describe('in production', () => {
    it.each([undefined, '', 'memory'])(
      'refuses RATE_LIMIT_DRIVER=%s: the in-memory limiter counts per instance',
      (driver) => {
        expect(() =>
          rateLimitConfigFrom({
            NODE_ENV: 'production',
            RATE_LIMIT_DRIVER: driver,
          }),
        ).toThrow(
          'RATE_LIMIT_DRIVER=memory is not allowed when NODE_ENV=production',
        );
      },
    );

    it('starts with RATE_LIMIT_DRIVER=redis', () => {
      const config = rateLimitConfigFrom({
        NODE_ENV: 'production',
        RATE_LIMIT_DRIVER: 'redis',
      });

      expect(config.driver).toBe('redis');
    });

    it.each(['test', 'development', undefined])(
      'allows the in-memory limiter when NODE_ENV is %s',
      (nodeEnv) => {
        expect(rateLimitConfigFrom({ NODE_ENV: nodeEnv }).driver).toBe(
          'memory',
        );
      },
    );
  });
});
