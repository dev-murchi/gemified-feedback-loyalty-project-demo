import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  BearerAuthGuard,
  CurrentPrincipal,
  type Principal,
} from '../../../../../platform/http/bearer-auth.guard.js';
import { parseBody } from '../../../../../platform/http/parse-body.js';
import { ProblemException } from '../../../../../platform/http/problem-exception.js';
import { rawBodyOf } from '../../../../../platform/http/raw-body.js';
import { requestIdOf } from '../../../../../platform/http/request-id.js';
import { UserId } from '../../../../../shared-kernel/ids.js';
import type { GetFeedbackStatus } from '../../../application/use-cases/get-feedback-status.js';
import type { SubmitFeedback } from '../../../application/use-cases/submit-feedback.js';
import { FeedbackSubmission } from './feedback.schemas.js';
import { GET_FEEDBACK_STATUS, SUBMIT_FEEDBACK } from './tokens.js';

/** The `FeedbackAccepted` schema of docs/api/openapi.yaml. */
interface FeedbackAcceptedBody {
  readonly feedbackId: string;
  readonly status: 'analyzing';
  readonly submittedAt: string;
  readonly rewardEligible: boolean;
}

/** The `FeedbackStatus` schema of docs/api/openapi.yaml. */
interface FeedbackStatusBody {
  readonly feedbackId: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly analyzedAt: string | null;
  readonly branch: { readonly id: string; readonly name: string };
  readonly reward: { readonly xp: number; readonly points: number } | null;
  readonly levelUp: { readonly from: number; readonly to: number } | null;
}

/** The principal comes from a verified token, whose `sub` was validated as a user id. */
const userIdOf = (principal: Principal): UserId => {
  const userId = UserId.create(principal.userId);
  if (!userId.ok)
    throw new Error('Authenticated principal has an invalid user id');
  return userId.value;
};

/** `POST /v1/feedbacks` and `GET /v1/feedbacks/{feedbackId}` (US-02, FR-GAM-06). */
@Controller('v1/feedbacks')
@UseGuards(BearerAuthGuard)
export class FeedbackController {
  constructor(
    @Inject(SUBMIT_FEEDBACK) private readonly submitFeedback: SubmitFeedback,
    @Inject(GET_FEEDBACK_STATUS) private readonly getStatus: GetFeedbackStatus,
  ) {}

  @Post()
  @HttpCode(202)
  async submit(
    @CurrentPrincipal() principal: Principal,
    @Req() request: RawBodyRequest<Request>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<FeedbackAcceptedBody> {
    const body = parseBody(FeedbackSubmission, request.body);
    const result = await this.submitFeedback.execute({
      userId: userIdOf(principal),
      keyIdentifier: principal.keyIdentifier,
      trustLevel: principal.trustLevel,
      idempotencyKey: request.header('Idempotency-Key') ?? '',
      qrToken: body.qrToken,
      text: body.text,
      body: rawBodyOf(request),
      platformProof: request.header('X-Platform-Proof'),
      correlationId: requestIdOf(response),
    });
    if (!result.ok) throw ProblemException.from(result.error);
    const accepted = result.value;
    response.setHeader('Location', `/v1/feedbacks/${accepted.feedbackId}`);
    response.setHeader('Idempotent-Replayed', String(accepted.replayed));
    return {
      feedbackId: accepted.feedbackId,
      status: accepted.status,
      submittedAt: accepted.submittedAt.toISOString(),
      rewardEligible: accepted.rewardEligible,
    };
  }

  @Get(':feedbackId')
  async status(
    @CurrentPrincipal() principal: Principal,
    @Param('feedbackId') feedbackId: string,
  ): Promise<FeedbackStatusBody> {
    const result = await this.getStatus.execute({
      userId: userIdOf(principal),
      feedbackId,
    });
    if (!result.ok) throw ProblemException.from(result.error);
    const view = result.value;
    return {
      ...view,
      submittedAt: view.submittedAt.toISOString(),
      analyzedAt: view.analyzedAt?.toISOString() ?? null,
    };
  }
}
