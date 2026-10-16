import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ClientAuthGuard,
  CurrentClient,
  RequireScope,
  type ClientPrincipal,
} from '../../../../../platform/http/client-auth.guard.js';
import { parseBody } from '../../../../../platform/http/parse-body.js';
import type { GetBranchSummary } from '../../../application/use-cases/get-branch-summary.js';
import type { GetHeatmap } from '../../../application/use-cases/get-heatmap.js';
import { B2bAuditInterceptor } from './b2b-audit.interceptor.js';
import { brandOf, valueOf } from './b2b-http.js';
import { RangeQuery } from './b2b.schemas.js';
import { GET_BRANCH_SUMMARY, GET_HEATMAP } from './tokens.js';

/** The `b2b.summary.read` endpoints: branch summary and heatmap (FR-B2B-04, FR-B2B-05). */
@Controller('v1/b2b')
@UseGuards(ClientAuthGuard)
@UseInterceptors(B2bAuditInterceptor)
export class B2bSummaryController {
  constructor(
    @Inject(GET_BRANCH_SUMMARY) private readonly getSummary: GetBranchSummary,
    @Inject(GET_HEATMAP) private readonly getHeatmap: GetHeatmap,
  ) {}

  @Get('branches/:branchId/summary')
  @RequireScope('b2b.summary.read')
  async summary(
    @CurrentClient() client: ClientPrincipal,
    @Param('branchId') branchId: string,
    @Query() query: unknown,
  ) {
    const range = parseBody(RangeQuery, query);
    return valueOf(
      await this.getSummary.execute({
        brandId: brandOf(client),
        branchId,
        ...range,
      }),
    );
  }

  @Get('heatmap')
  @RequireScope('b2b.summary.read')
  async heatmap(
    @CurrentClient() client: ClientPrincipal,
    @Query() query: unknown,
  ) {
    const range = parseBody(RangeQuery, query);
    return valueOf(
      await this.getHeatmap.execute({ brandId: brandOf(client), ...range }),
    );
  }
}
