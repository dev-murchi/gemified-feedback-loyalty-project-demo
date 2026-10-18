import {
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IpRateLimitGuard } from '../../../../../platform/http/ip-rate-limit.guard.js';
import type { IssueB2bToken } from '../../../application/use-cases/issue-b2b-token.js';
import type { TokenRejection } from '../../../domain/b2b-client/token-errors.js';
import { ISSUE_B2B_TOKEN } from './tokens.js';

/** The contract's `B2bToken` (RFC 6749 §5.1 names). */
interface B2bTokenBody {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly scope: string;
}

/** invalid_client is 401 (the contract); every other RFC 6749 error is 400. */
const statusOf = (rejection: TokenRejection): number =>
  rejection.error === 'invalid_client' ? 401 : 400;

const field = (
  body: Record<string, unknown>,
  name: string,
): string | undefined => {
  const value = body[name];
  return typeof value === 'string' ? value : undefined;
};

/**
 * `POST /v1/b2b/oauth/token` (FR-B2B-01): client credentials in an
 * application/x-www-form-urlencoded body. Its errors are RFC 6749 JSON (`{ "error": … }`), the one
 * exception to Problem Details (docs/07 §6); X-Request-Id is still set by the platform.
 */
@Controller('v1/b2b/oauth')
@UseGuards(IpRateLimitGuard)
export class B2bTokenController {
  constructor(@Inject(ISSUE_B2B_TOKEN) private readonly issue: IssueB2bToken) {}

  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async token(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<B2bTokenBody | { readonly error: string }> {
    const body: Record<string, unknown> = request.is(
      'application/x-www-form-urlencoded',
    )
      ? (request.body as Record<string, unknown>)
      : {};
    const result = await this.issue.execute({
      grantType: field(body, 'grant_type'),
      clientId: field(body, 'client_id'),
      clientSecret: field(body, 'client_secret'),
      scope: field(body, 'scope'),
    });
    if (!result.ok) {
      response.status(statusOf(result.error));
      return { error: result.error.error };
    }
    return {
      access_token: result.value.accessToken,
      token_type: result.value.tokenType,
      expires_in: result.value.expiresIn,
      scope: result.value.scope,
    };
  }
}
