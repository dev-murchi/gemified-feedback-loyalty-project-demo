import { Global, Module } from '@nestjs/common';
import {
  RATE_LIMIT_ENFORCER,
  RateLimitEnforcer,
} from '../platform/http/rate-limit.enforcer.js';
import {
  REFUSAL_SUMMARY,
  RefusalSummary,
  timerSchedule,
} from '../platform/http/refusal-summary.js';
import type { Clock } from '../shared-kernel/clock.js';
import type { Logger } from '../shared-kernel/logger.js';
import {
  rateLimitConfigFrom,
  type RateLimitConfig,
} from './rate-limit-config.js';
import {
  createRateLimiter,
  type ManagedRateLimiter,
} from './rate-limiter-driver.js';
import {
  CLOCK,
  LOGGER,
  RATE_LIMIT_CONFIG,
  RATE_LIMITER,
  REFUSAL_SUMMARY_SHUTDOWN,
} from './tokens.js';

/**
 * The technical rate limits (FR-QR-06): the guards of `platform/http` find the enforcer here, so
 * every module with a guarded route gets it without importing this module. Settings come from the
 * RATE_LIMIT_* variables and TRUST_PROXY_HOPS.
 */
@Global()
@Module({
  providers: [
    {
      provide: RATE_LIMIT_CONFIG,
      useFactory: () => rateLimitConfigFrom(process.env),
    },
    {
      provide: RATE_LIMITER,
      inject: [RATE_LIMIT_CONFIG, CLOCK, LOGGER],
      useFactory: (config: RateLimitConfig, clock: Clock, logger: Logger) =>
        createRateLimiter(config, { clock, logger }),
    },
    {
      provide: RATE_LIMIT_ENFORCER,
      inject: [RATE_LIMITER, RATE_LIMIT_CONFIG],
      useFactory: (limiter: ManagedRateLimiter, config: RateLimitConfig) =>
        new RateLimitEnforcer({ limiter, policies: config.policies }),
    },
    {
      provide: REFUSAL_SUMMARY,
      inject: [LOGGER],
      useFactory: (logger: Logger) =>
        new RefusalSummary({ logger, schedule: timerSchedule }),
    },
    {
      // Reports the refusals of a window that is still open when the application stops.
      provide: REFUSAL_SUMMARY_SHUTDOWN,
      inject: [REFUSAL_SUMMARY],
      useFactory: (summary: RefusalSummary) => ({
        onModuleDestroy: () => summary.flush(),
      }),
    },
  ],
  exports: [RATE_LIMIT_CONFIG, RATE_LIMIT_ENFORCER, REFUSAL_SUMMARY],
})
export class RateLimitModule {}
