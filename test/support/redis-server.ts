import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';

/** The image docker-compose.yml uses; Testcontainers starts it on a free port. */
const REDIS_IMAGE = 'redis:7.2-alpine';

/** One Redis server for a whole test run (the integration and e2e global setups start it). */
export const startRedis = (): Promise<StartedRedisContainer> =>
  new RedisContainer(REDIS_IMAGE).start();
