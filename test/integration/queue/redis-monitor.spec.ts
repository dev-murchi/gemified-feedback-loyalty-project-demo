// What the log says about Redis: "Redis connected" once it is reachable, "Redis connection lost"
// (warn) when a connected client drops, nothing when we close it ourselves. The monitor connects
// through a proxy that the test can cut: the run's Redis serves other test files and is never stopped.

import { RedisMonitor } from '../../../src/platform/queue/redis-monitor.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import { freshRedis, type TestRedis } from '../../support/redis.js';
import { startProxy, type TcpProxy } from '../../support/tcp-proxy.js';
import { waitFor } from '../../support/wait-for.js';

describe('RedisMonitor', () => {
  let redis: TestRedis;
  let proxy: TcpProxy;
  let logger: RecordingLogger;
  let monitor: RedisMonitor;

  beforeAll(async () => {
    redis = await freshRedis();
  });

  afterAll(() => redis.release());

  beforeEach(async () => {
    proxy = await startProxy({ host: redis.getHost(), port: redis.getPort() });
    logger = new RecordingLogger();
    monitor = new RedisMonitor({
      connection: { host: proxy.host, port: proxy.port },
      logger,
    });
  });

  afterEach(async () => {
    await monitor.stop();
    await proxy.cut();
  });

  const endpoint = () => ({ redisHost: proxy.host, redisPort: proxy.port });

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

    await proxy.cut();

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
