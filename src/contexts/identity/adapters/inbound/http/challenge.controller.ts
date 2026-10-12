import { Controller, Header, HttpCode, Inject, Post } from '@nestjs/common';
import { ProblemException } from '../../../../../platform/http/problem-exception.js';
import type { CreateChallenge } from '../../../application/use-cases/create-challenge.js';
import { CREATE_CHALLENGE } from './tokens.js';

/** `POST /v1/auth/challenge`: a single-use nonce for registration or a session (FR-AUTH-03). */
@Controller('v1/auth')
export class ChallengeController {
  constructor(
    @Inject(CREATE_CHALLENGE) private readonly createChallenge: CreateChallenge,
  ) {}

  @Post('challenge')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async challenge(): Promise<{ nonce: string; expiresAt: string }> {
    const created = await this.createChallenge.execute();
    if (!created.ok) throw ProblemException.from(created.error);
    return {
      nonce: created.value.nonce,
      expiresAt: created.value.expiresAt.toISOString(),
    };
  }
}
