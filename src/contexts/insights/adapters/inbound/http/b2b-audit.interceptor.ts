import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import {
  clientOf,
  endpointOf,
} from '../../../../../platform/http/client-auth.guard.js';
import type { RecordB2bAccess } from '../../../application/use-cases/record-b2b-access.js';
import { RECORD_B2B_ACCESS } from './tokens.js';

/** A body with `items` (lists, the heatmap, the topic list) counts its items; a summary is one. */
const recordsIn = (body: unknown): number => {
  const items = (body as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items.length : 1;
};

/**
 * FR-B2B-09: every B2B call that passed ClientAuthGuard is audited before its response leaves:
 * with the number of records on success, with 0 when it failed (a 404 cross-brand probe included).
 * If the audit cannot be written the request fails, so no data is handed out unaudited.
 */
@Injectable()
export class B2bAuditInterceptor implements NestInterceptor {
  constructor(
    @Inject(RECORD_B2B_ACCESS) private readonly recordAccess: RecordB2bAccess,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    return from(
      this.#audited(
        http.getRequest<Request>(),
        http.getResponse<Response>(),
        next,
      ),
    );
  }

  async #audited(
    request: Request,
    response: Response,
    next: CallHandler,
  ): Promise<unknown> {
    const client = clientOf(response);
    if (client === undefined)
      throw new Error('B2bAuditInterceptor runs only after ClientAuthGuard');
    const entry = { clientId: client.clientId, endpoint: endpointOf(request) };
    let body: unknown;
    try {
      body = await lastValueFrom(next.handle());
    } catch (error) {
      await this.recordAccess.execute({ ...entry, recordCount: 0 });
      throw error;
    }
    await this.recordAccess.execute({ ...entry, recordCount: recordsIn(body) });
    return body;
  }
}
