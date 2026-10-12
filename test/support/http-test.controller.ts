import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  BearerAuthGuard,
  CurrentPrincipal,
  type Principal,
} from '../../src/platform/http/bearer-auth.guard.js';
import { parseBody } from '../../src/platform/http/parse-body.js';
import { ProblemException } from '../../src/platform/http/problem-exception.js';
import { z } from 'zod';
import { ConcurrencyConflictError } from '../../src/shared-kernel/concurrency-conflict-error.js';

/** Routes that raise each kind of error the platform must turn into a Problem. */
const EchoBody = z
  .object({ nonce: z.string(), count: z.number().int() })
  .strict();

@Controller('test')
export class HttpTestController {
  @Get('expected')
  expected(): never {
    throw ProblemException.from({ code: 'KEY_REVOKED' });
  }

  @Get('cooldown')
  cooldown(): never {
    throw new ProblemException('REWARD_COOLDOWN', { retryAfterSeconds: 3600 });
  }

  @Get('invalid')
  invalid(): never {
    throw ProblemException.from({
      code: 'VALIDATION_ERROR',
      field: 'keyId',
    } as { code: 'VALIDATION_ERROR' });
  }

  @Get('boom')
  boom(): never {
    throw new Error('secret internal detail: db password is hunter2');
  }

  @Get('conflict')
  conflict(): never {
    throw new ConcurrencyConflictError('some-aggregate');
  }

  @Post('echo')
  echo(@Body() body: unknown): unknown {
    return body;
  }

  @Post('validated')
  validated(@Body() body: unknown): unknown {
    return parseBody(EchoBody, body);
  }

  @Get('private')
  @UseGuards(BearerAuthGuard)
  private(@CurrentPrincipal() principal: Principal): Principal {
    return principal;
  }
}
