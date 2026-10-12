import {
  Inject,
  Injectable,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { DomainError } from '../../shared-kernel/domain-error.js';
import type { Result } from '../../shared-kernel/result.js';
import { ProblemException } from './problem-exception.js';

/** Injection token for the Authenticator the composition root provides. */
export const AUTHENTICATOR = Symbol('Authenticator');

/** Who is calling, as controllers need it. The composition root adapts Identity's claims to it. */
export interface Principal {
  readonly userId: string;
  readonly keyIdentifier: string;
  readonly trustLevel: 'normal' | 'low';
}

/**
 * Turns the `Authorization` header into a caller. Defined here, implemented in the composition
 * root with Identity's `AuthenticateRequest`, so `platform/` imports no context.
 */
export interface Authenticator {
  authenticate(
    authorization: string | undefined,
  ): Promise<Result<Principal, DomainError>>;
}

const PRINCIPAL = 'principal';

/** `mobileBearer` security (docs/api/openapi.yaml): no valid token, no handler. */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTHENTICATOR) private readonly authenticator: Authenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const authorization = http.getRequest<Request>().header('authorization');
    const caller = await this.authenticator.authenticate(authorization);
    if (!caller.ok) throw ProblemException.from(caller.error);
    http.getResponse<Response>().locals[PRINCIPAL] = caller.value;
    return true;
  }
}

/** The caller a BearerAuthGuard let through; using it without the guard is a programming error. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal: unknown = context.switchToHttp().getResponse<Response>()
      .locals[PRINCIPAL];
    if (principal === undefined)
      throw new Error(
        'CurrentPrincipal used on a route without BearerAuthGuard',
      );
    return principal as Principal;
  },
);
