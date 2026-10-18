import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { clientAddressOf } from './client-address.js';
import { ProblemException } from './problem-exception.js';
import {
  RATE_LIMIT_ENFORCER,
  type RateLimitEnforcer,
} from './rate-limit.enforcer.js';

/**
 * The IP limit of the endpoints that have no identity yet: challenge, register, session and the
 * B2B token endpoint (docs/api/openapi.yaml "Hız sınırları"). Every other endpoint is limited by
 * its verified identity (`withDeviceLimit`, `withClientLimit`).
 */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMIT_ENFORCER) private readonly limits: RateLimitEnforcer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const counted = await this.limits.ip(clientAddressOf(request));
    if (!counted.ok) throw ProblemException.from(counted.error);
    return true;
  }
}
