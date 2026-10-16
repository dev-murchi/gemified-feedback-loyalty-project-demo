import {
  Controller,
  Get,
  Inject,
  UseInterceptors,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ClientAuthGuard,
  CurrentClient,
  RequireScope,
  type ClientPrincipal,
} from '../../../../../platform/http/client-auth.guard.js';
import { parseBody } from '../../../../../platform/http/parse-body.js';
import type { ListBrandFeedbacks } from '../../../application/use-cases/list-brand-feedbacks.js';
import type { ListBranches } from '../../../application/use-cases/list-branches.js';
import type { ListTopics } from '../../../application/use-cases/list-topics.js';
import { B2bAuditInterceptor } from './b2b-audit.interceptor.js';
import { brandOf, valueOf } from './b2b-http.js';
import { FeedbackListQuery, PageQuery } from './b2b.schemas.js';
import { LIST_BRAND_FEEDBACKS, LIST_BRANCHES, LIST_TOPICS } from './tokens.js';

/** The `b2b.feedback.read` endpoints: branches, feedback and topics (FR-B2B-02, FR-B2B-03). */
@Controller('v1/b2b')
@UseGuards(ClientAuthGuard)
@UseInterceptors(B2bAuditInterceptor)
export class B2bFeedbackController {
  constructor(
    @Inject(LIST_BRANCHES) private readonly listBranches: ListBranches,
    @Inject(LIST_BRAND_FEEDBACKS)
    private readonly listFeedbacks: ListBrandFeedbacks,
    @Inject(LIST_TOPICS) private readonly listTopics: ListTopics,
  ) {}

  @Get('branches')
  @RequireScope('b2b.feedback.read')
  async branches(
    @CurrentClient() client: ClientPrincipal,
    @Query() query: unknown,
  ) {
    const page = parseBody(PageQuery, query);
    return valueOf(
      await this.listBranches.execute({ brandId: brandOf(client), ...page }),
    );
  }

  @Get('feedbacks')
  @RequireScope('b2b.feedback.read')
  async feedbacks(
    @CurrentClient() client: ClientPrincipal,
    @Query() query: unknown,
  ) {
    const filters = parseBody(FeedbackListQuery, query);
    const page = valueOf(
      await this.listFeedbacks.execute({
        brandId: brandOf(client),
        ...filters,
      }),
    );
    return {
      items: page.items.map((item) => ({
        ...item,
        submittedAt: item.submittedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  @Get('topics')
  @RequireScope('b2b.feedback.read')
  topics(@CurrentClient() client: ClientPrincipal) {
    return this.listTopics.execute({ brandId: brandOf(client) });
  }
}
