// What the log says about Redis: "Redis connected" once it is reachable, "Redis connection lost"
// (warn) when a connected client drops, nothing when we close it ourselves.

import type { StartedRedisContainer } from '@testcontainers/redis';
import { RedisMonitor } from '../../../src/platform/queue/redis-monitor.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import { connectionOf, startRedis } from '../../support/redis-container.js';
import { waitFor } from '../../support/wait-for.js';

describe('RedisMonitor', () => {
  let redis: StartedRedisContainer;
  let logger: RecordingLogger;
  let monitor: RedisMonitor;

  beforeEach(async () => {
    redis = await startRedis();
    logger = new RecordingLogger();
    monitor = new RedisMonitor({ connection: connectionOf(redis), logger });
  });

  afterEach(async () => {
    await monitor.stop();
    await redis.stop().catch(() => undefined);
  });

  const endpoint = () => ({
    redisHost: redis.getHost(),
    redisPort: redis.getPort(),
  });

  it('logs "Redis connected" once, with host and port only', async () => {
    monitor.start();
    monitor.start();

    await waitFor(() => logger.infos.length === 1, 'the connection');

    expect(logger.infos).toEqual([
      { message: 'Redis connected', fields: endpoint() },
    ]);
    expect(logger.warnings).toEqual([]);
  });

  it('logs "Redis connection lost" (warn) once when Redis goes away', async () => {
    monitor.start();
    await waitFor(() => logger.infos.length === 1, 'the connection');

    await redis.stop();

    await waitFor(() => logger.warnings.length === 1, 'the loss');
    expect(logger.warnings).toEqual([
      { message: 'Redis connection lost', fields: endpoint() },
    ]);
  });

  it('does not call its own close a loss', async () => {
    monitor.start();
    await waitFor(() => logger.infos.length === 1, 'the connection');

    await monitor.stop(); // resolves once the connection has really ended

    expect(logger.warnings).toEqual([]);
  });
});
