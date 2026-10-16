import {
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { DomainError } from '../../shared-kernel/domain-error.js';
import type { Result } from '../../shared-kernel/result.js';
import { ProblemException } from './problem-exception.js';

/** Injection token for the ClientAuthenticator the composition root provides. */
export const CLIENT_AUTHENTICATOR = Symbol('ClientAuthenticator');

/** A B2B API client as controllers need it; the composition root adapts Insights' claims to it. */
export interface ClientPrincipal {
  readonly clientId: string;
  readonly brandId: string;
  readonly scopes: readonly string[];
}

/**
 * Turns the `Authorization` header into an API client. Defined here, implemented in the composition
 * root with Insights' token verifier, so `platform/` imports no context.
 */
export interface ClientAuthenticator {
  authenticate(
    authorization: string | undefined,
  ): Promise<Result<ClientPrincipal, DomainError>>;
}

/** Injection token for the ClientAccessRecorder the composition root provides. */
export const CLIENT_ACCESS_RECORDER = Symbol('ClientAccessRecorder');

/**
 * Records a client's access that the guard refused for a missing scope (FR-B2B-09: every access
 * is audited). Defined here, implemented in the composition root with Insights' audit log.
 */
export interface ClientAccessRecorder {
  denied(access: {
    readonly clientId: string;
    readonly endpoint: string;
  }): Promise<void>;
}

/** The method and route template of a request, e.g. `GET /v1/b2b/branches/:branchId/summary`. */
export const endpointOf = (request: Request): string => {
  const route = (request.route as { path?: unknown } | undefined)?.path;
  return `${request.method} ${typeof route === 'string' ? route : request.path}`;
};

const REQUIRED_SCOPE = 'requiredScope';
const CLIENT = 'client';

/** The scope a route needs (docs/api/openapi.yaml `b2bOAuth: [scope]`). */
export const RequireScope = (scope: string) =>
  SetMetadata(REQUIRED_SCOPE, scope);

/**
 * `b2bOAuth` security: no valid B2B token is 401 UNAUTHORIZED; a valid token without the route's
 * scope is 403 FORBIDDEN (TC-B2B-04), recorded first, since the client is known. A route without
 * RequireScope is a programming error.
 */
@Injectable()
export class ClientAuthGuard implements CanActivate {
  constructor(
    @Inject(CLIENT_AUTHENTICATOR)
    private readonly authenticator: ClientAuthenticator,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CLIENT_ACCESS_RECORDER)
    private readonly recorder: ClientAccessRecorder,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.get<string | undefined>(
      REQUIRED_SCOPE,
      context.getHandler(),
    );
    if (scope === undefined)
      throw new Error('ClientAuthGuard needs RequireScope on the route');
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const caller = await this.authenticator.authenticate(
      request.header('authorization'),
    );
    if (!caller.ok) throw ProblemException.from(caller.error);
    if (!caller.value.scopes.includes(scope)) {
      await this.recorder.denied({
        clientId: caller.value.clientId,
        endpoint: endpointOf(request),
      });
      throw new ProblemException('FORBIDDEN');
    }
    http.getResponse<Response>().locals[CLIENT] = caller.value;
    return true;
  }
}

/** The client a ClientAuthGuard let through, or undefined if the request did not pass one. */
export const clientOf = (response: Response): ClientPrincipal | undefined => {
  const client: unknown = response.locals[CLIENT];
  return client === undefined ? undefined : (client as ClientPrincipal);
};

/** The client a ClientAuthGuard let through; using it without the guard is a programming error. */
export const CurrentClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientPrincipal => {
    const client: unknown = context.switchToHttp().getResponse<Response>()
      .locals[CLIENT];
    if (client === undefined)
      throw new Error('CurrentClient used on a route without ClientAuthGuard');
    return client as ClientPrincipal;
  },
);
