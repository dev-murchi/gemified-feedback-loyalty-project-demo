import { redisConnectionFrom } from '../../../src/platform/queue/redis-connection.js';

describe('redisConnectionFrom', () => {
  it('reads host and port, with Redis defaults', () => {
    expect(redisConnectionFrom('redis://cache.internal:6380')).toEqual({
      host: 'cache.internal',
      port: 6380,
      db: 0,
    });
    expect(redisConnectionFrom('redis://localhost')).toMatchObject({
      host: 'localhost',
      port: 6379,
    });
  });

  it('reads the user, the password (percent-decoded) and the database', () => {
    expect(
      redisConnectionFrom('redis://worker:p%40ss@cache.internal:6379/2'),
    ).toEqual({
      host: 'cache.internal',
      port: 6379,
      db: 2,
      username: 'worker',
      password: 'p@ss',
    });
  });

  it('turns on TLS for rediss://', () => {
    expect(redisConnectionFrom('rediss://cache.internal')).toMatchObject({
      tls: {},
    });
  });
});
