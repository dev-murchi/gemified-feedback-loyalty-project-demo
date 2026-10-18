import type { RateLimitPolicies } from '../platform/http/rate-limit.enforcer.js';
import type { RateLimitPolicy } from '../platform/rate-limit/rate-limiter.js';
import { DEFAULT_REDIS_URL } from '../platform/queue/redis-connection.js';

/** The environment variables of the technical rate limits (FR-QR-06, ADR-016). */
export interface RateLimitEnv {
  readonly RATE_LIMIT_DRIVER?: string | undefined;
  readonly RATE_LIMIT_DEVICE_PER_MINUTE?: string | undefined;
  readonly RATE_LIMIT_DEVICE_BURST?: string | undefined;
  readonly RATE_LIMIT_CLIENT_PER_MINUTE?: string | undefined;
  readonly RATE_LIMIT_CLIENT_BURST?: string | undefined;
  readonly RATE_LIMIT_IP_PER_MINUTE?: string | undefined;
  readonly RATE_LIMIT_IP_BURST?: string | undefined;
  readonly TRUST_PROXY_HOPS?: string | undefined;
  readonly REDIS_URL?: string | undefined;
  readonly NODE_ENV?: string | undefined;
}

export type RateLimitDriver = 'memory' | 'redis';

export interface RateLimitConfig {
  readonly driver: RateLimitDriver;
  readonly policies: RateLimitPolicies;
  readonly trustProxyHops: number;
  readonly redisUrl: string;
}

/** One numeric setting: its variable, the default, and the smallest value that makes sense. */
interface Setting {
  readonly name: keyof RateLimitEnv;
  readonly fallback: number;
  readonly min: number;
}

/** Whole number from the environment: absent or empty means the default; anything else must parse. */
function wholeNumber(env: RateLimitEnv, setting: Setting): number {
  const value = env[setting.name];
  if (value === undefined || value === '') return setting.fallback;
  const number = Number(value);
  // Digits only: "1e3", "0x10" and " 5 " are typos, not settings.
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(number) ||
    number < setting.min
  )
    throw new Error(
      `${setting.name} must be a whole number of at least ${setting.min}`,
    );
  return number;
}

type Kind = 'DEVICE' | 'CLIENT' | 'IP';

const policyFrom = (
  env: RateLimitEnv,
  kind: Kind,
  defaults: RateLimitPolicy,
): RateLimitPolicy => ({
  perMinute: wholeNumber(env, {
    name: `RATE_LIMIT_${kind}_PER_MINUTE` as const,
    fallback: defaults.perMinute,
    min: 1,
  }),
  burst: wholeNumber(env, {
    name: `RATE_LIMIT_${kind}_BURST` as const,
    fallback: defaults.burst,
    min: 1,
  }),
});

/**
 * RATE_LIMIT_DRIVER: `memory` or `redis`. The in-memory limiter counts per process, so with the
 * two or more API instances of SDD 9.1 every caller would get a multiple of its limit: production
 * refuses it (like the development verifiers and demo data) and needs `redis` set explicitly.
 */
export function rateLimitDriverOf(env: RateLimitEnv): RateLimitDriver {
  const driver =
    env.RATE_LIMIT_DRIVER === undefined || env.RATE_LIMIT_DRIVER === ''
      ? 'memory'
      : env.RATE_LIMIT_DRIVER;
  if (driver !== 'memory' && driver !== 'redis')
    throw new Error(`Unknown RATE_LIMIT_DRIVER "${driver}"`);
  if (driver === 'memory' && env.NODE_ENV === 'production')
    throw new Error(
      'RATE_LIMIT_DRIVER=memory is not allowed when NODE_ENV=production: ' +
        'every API instance would count on its own; set RATE_LIMIT_DRIVER=redis',
    );
  return driver;
}

/**
 * The limits and where they are kept. Defaults (owner decision, 17 Oct 2026): a verified device
 * 120 per minute with a burst of 30, a B2B client 600 per minute with a burst of 100, an IP address
 * before authentication 300 per minute with a burst of 100. TRUST_PROXY_HOPS is how many reverse
 * proxies set X-Forwarded-For; 0 ignores the header. Invalid values stop the start-up.
 */
export function rateLimitConfigFrom(env: RateLimitEnv): RateLimitConfig {
  return {
    driver: rateLimitDriverOf(env),
    policies: {
      device: policyFrom(env, 'DEVICE', { perMinute: 120, burst: 30 }),
      client: policyFrom(env, 'CLIENT', { perMinute: 600, burst: 100 }),
      ip: policyFrom(env, 'IP', { perMinute: 300, burst: 100 }),
    },
    trustProxyHops: wholeNumber(env, {
      name: 'TRUST_PROXY_HOPS',
      fallback: 0,
      min: 0,
    }),
    redisUrl:
      env.REDIS_URL === undefined || env.REDIS_URL === ''
        ? DEFAULT_REDIS_URL
        : env.REDIS_URL,
  };
}
