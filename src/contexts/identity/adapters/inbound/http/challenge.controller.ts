import { Controller, Header, HttpCode, Inject, Post } from '@nestjs/common';
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
    const challenge = await this.createChallenge.execute();
    return {
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }
}
