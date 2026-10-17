import { randomUUID } from 'node:crypto';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import type { ConnectionOptions } from 'bullmq';

/** The image docker-compose.yml uses; Testcontainers starts it on a free port. */
const REDIS_IMAGE = 'redis:7.2-alpine';

export const startRedis = (): Promise<StartedRedisContainer> =>
  new RedisContainer(REDIS_IMAGE).start();

export const connectionOf = (
  redis: StartedRedisContainer,
): ConnectionOptions => ({
  host: redis.getHost(),
  port: redis.getPort(),
});

/** A Redis key prefix of its own, so that tests sharing one container never meet. */
export const freshPrefix = (): string => `test-${randomUUID()}`;
