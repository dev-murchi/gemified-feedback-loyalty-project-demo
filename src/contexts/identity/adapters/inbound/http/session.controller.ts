import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { IpRateLimitGuard } from '../../../../../platform/http/ip-rate-limit.guard.js';
import { parseBody } from '../../../../../platform/http/parse-body.js';
import { ProblemException } from '../../../../../platform/http/problem-exception.js';
import type { DomainError } from '../../../../../shared-kernel/domain-error.js';
import type { Result } from '../../../../../shared-kernel/result.js';
import type { SessionGrant } from '../../../application/session-grant.js';
import type { AttestationEvidence } from '../../../application/ports/attestation-verifier.js';
import type { CreateSession } from '../../../application/use-cases/create-session.js';
import type { RegisterDevice } from '../../../application/use-cases/register-device.js';
import { RegisterRequest, SessionRequest } from './auth.schemas.js';
import type {
  SessionWalletReader,
  WalletSummary,
} from './session-wallet-reader.js';
import {
  CREATE_SESSION,
  REGISTER_DEVICE,
  SESSION_WALLET_READER,
} from './tokens.js';

/** The `Session` schema of docs/api/openapi.yaml. */
interface SessionBody {
  readonly userId: string;
  readonly trustLevel: string;
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly wallet: WalletSummary;
}

/** A use case's business outcome becomes its value, or a Problem Details response. */
const valueOf = <T>(result: Result<T, DomainError>): T => {
  if (!result.ok) throw ProblemException.from(result.error);
  return result.value;
};

const evidenceOf = (
  request: z.infer<typeof RegisterRequest>,
): AttestationEvidence =>
  request.platform === 'ios'
    ? {
        platform: 'ios',
        keyId: request.keyId,
        attestationObject: request.attestationObject,
      }
    : {
        platform: 'android',
        certificateChain: request.certificateChain,
        integrityToken: request.integrityToken,
      };

/** `POST /v1/auth/register` and `/v1/auth/session`: both answer with the `Session` schema. */
@Controller('v1/auth')
@UseGuards(IpRateLimitGuard)
export class SessionController {
  constructor(
    @Inject(REGISTER_DEVICE) private readonly registerDevice: RegisterDevice,
    @Inject(CREATE_SESSION) private readonly createSession: CreateSession,
    @Inject(SESSION_WALLET_READER)
    private readonly wallets: SessionWalletReader,
  ) {}

  /** 201 for a new user and wallet, 200 when the key was already registered (FR-AUTH-02). */
  @Post('register')
  @Header('Cache-Control', 'no-store')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionBody> {
    const request = parseBody(RegisterRequest, body);
    const registered = valueOf(
      await this.registerDevice.execute({
        nonce: request.nonce,
        evidence: evidenceOf(request),
      }),
    );
    response.status(registered.created ? 201 : 200);
    return this.#sessionBody(registered);
  }

  @Post('session')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async session(@Body() body: unknown): Promise<SessionBody> {
    const request = parseBody(SessionRequest, body);
    const grant = valueOf(
      await this.createSession.execute({
        platform: request.platform,
        keyId: request.keyId,
        nonce: request.nonce,
        proof:
          request.platform === 'ios' ? request.assertion : request.signature,
      }),
    );
    return this.#sessionBody(grant);
  }

  /** The grant of the use case plus the wallet. */
  async #sessionBody(grant: SessionGrant): Promise<SessionBody> {
    return {
      userId: grant.userId,
      trustLevel: grant.trustLevel,
      accessToken: grant.accessToken,
      tokenType: 'Bearer',
      expiresIn: grant.expiresIn,
      wallet: await this.wallets.walletOf(grant.userId),
    };
  }
}
