import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { LabelSetProvider } from '../contexts/catalog/public/label-set-provider.js';
import { B2bFeedbackController } from '../contexts/insights/adapters/inbound/http/b2b-feedback.controller.js';
import { B2bSummaryController } from '../contexts/insights/adapters/inbound/http/b2b-summary.controller.js';
import { B2bTokenController } from '../contexts/insights/adapters/inbound/http/b2b-token.controller.js';
import {
  GET_BRANCH_SUMMARY,
  GET_HEATMAP,
  ISSUE_B2B_TOKEN,
  LIST_BRAND_FEEDBACKS,
  LIST_BRANCHES,
  LIST_TOPICS,
} from '../contexts/insights/adapters/inbound/http/tokens.js';
import { loadB2bSigningKey } from '../contexts/insights/adapters/outbound/b2b-signing-key.js';
import { JoseB2bTokens } from '../contexts/insights/adapters/outbound/jose-b2b-tokens.js';
import { MemoryB2bClientRepository } from '../contexts/insights/adapters/outbound/memory-b2b-client.repository.js';
import { ScryptSecretHasher } from '../contexts/insights/adapters/outbound/scrypt-secret-hasher.js';
import type { B2bAccessTokens } from '../contexts/insights/application/ports/b2b-access-tokens.js';
import type { B2bClientRepository } from '../contexts/insights/application/ports/b2b-client-repository.js';
import type { ReportingQueries } from '../contexts/insights/application/ports/reporting-queries.js';
import type { SecretHasher } from '../contexts/insights/application/ports/secret-hasher.js';
import { GetBranchSummary } from '../contexts/insights/application/use-cases/get-branch-summary.js';
import { GetHeatmap } from '../contexts/insights/application/use-cases/get-heatmap.js';
import { IssueB2bToken } from '../contexts/insights/application/use-cases/issue-b2b-token.js';
import { ListBrandFeedbacks } from '../contexts/insights/application/use-cases/list-brand-feedbacks.js';
import { ListBranches } from '../contexts/insights/application/use-cases/list-branches.js';
import { ListTopics } from '../contexts/insights/application/use-cases/list-topics.js';
import {
  CLIENT_AUTHENTICATOR,
  ClientAuthGuard,
  type ClientAuthenticator,
} from '../platform/http/client-auth.guard.js';
import type { Logger } from '../shared-kernel/logger.js';
import { CatalogModule } from './catalog.module.js';
import { loadDemoB2bClients } from './demo-b2b-clients.js';
import type { InMemoryStore } from './in-memory-store.js';
import { MemoryReportingQueries } from './memory-reporting-queries.js';
import {
  B2B_ACCESS_TOKENS,
  B2B_CLIENT_REPOSITORY,
  DEMO_B2B_CLIENTS,
  IN_MEMORY_STORE,
  LABEL_SET_PROVIDER,
  LOGGER,
  REPORTING_QUERIES,
  SECRET_HASHER,
} from './tokens.js';

/** The `b2bOAuth` scheme over Insights' token verifier, so platform/ imports no context. */
const authenticatorFor = (tokens: B2bAccessTokens): ClientAuthenticator => ({
  async authenticate(authorization) {
    const token = /^Bearer ([A-Za-z0-9._~+/=-]+)$/i.exec(
      authorization ?? '',
    )?.[1];
    if (token === undefined)
      return { ok: false, error: { code: 'UNAUTHORIZED' } };
    const claims = await tokens.verify(token);
    return claims.ok ? { ok: true, value: { ...claims.value } } : claims;
  },
});

/**
 * Insights wiring (in-memory until S0-11). The B2B signing key comes from B2B_JWT_PRIVATE_KEY and
 * B2B_JWT_KEY_ID and is required in production; demo clients come from B2B_DEMO_CLIENTS. The read
 * model lives here in composition, the only layer that sees every context's tables (B6).
 */
@Module({
  imports: [CatalogModule],
  controllers: [
    B2bTokenController,
    B2bFeedbackController,
    B2bSummaryController,
  ],
  providers: [
    {
      provide: B2B_CLIENT_REPOSITORY,
      inject: [IN_MEMORY_STORE],
      useFactory: (store: InMemoryStore) =>
        new MemoryB2bClientRepository({
          table: store.insights.b2bClients,
          events: store.uow,
        }),
    },
    { provide: SECRET_HASHER, useFactory: () => new ScryptSecretHasher() },
    {
      provide: B2B_ACCESS_TOKENS,
      inject: [IN_MEMORY_STORE, LOGGER],
      useFactory: (store: InMemoryStore, logger: Logger) =>
        new JoseB2bTokens({
          key: loadB2bSigningKey(
            {
              nodeEnv: process.env['NODE_ENV'],
              privateKeyPem: process.env['B2B_JWT_PRIVATE_KEY'],
              keyId: process.env['B2B_JWT_KEY_ID'],
            },
            logger,
          ),
          clock: store.clock,
        }),
    },
    {
      provide: ISSUE_B2B_TOKEN,
      inject: [
        B2B_CLIENT_REPOSITORY,
        SECRET_HASHER,
        B2B_ACCESS_TOKENS,
        IN_MEMORY_STORE,
      ],
      useFactory: async (
        ...[clients, hasher, tokens, store]: [
          B2bClientRepository,
          SecretHasher,
          B2bAccessTokens,
          InMemoryStore,
        ]
      ) =>
        new IssueB2bToken({
          clients,
          hasher,
          tokens,
          clock: store.clock,
          // A hash of a secret nobody knows: an unknown client id costs as long as a known one.
          decoyHash: await hasher.hash(randomBytes(32).toString('base64')),
        }),
    },
    {
      provide: REPORTING_QUERIES,
      inject: [IN_MEMORY_STORE],
      useFactory: (store: InMemoryStore) => new MemoryReportingQueries(store),
    },
    {
      provide: LIST_BRANCHES,
      inject: [REPORTING_QUERIES],
      useFactory: (reporting: ReportingQueries) =>
        new ListBranches({ reporting }),
    },
    {
      provide: LIST_BRAND_FEEDBACKS,
      inject: [REPORTING_QUERIES, LABEL_SET_PROVIDER, IN_MEMORY_STORE],
      useFactory: (
        reporting: ReportingQueries,
        labelSets: LabelSetProvider,
        store: InMemoryStore,
      ) => new ListBrandFeedbacks({ reporting, labelSets, clock: store.clock }),
    },
    {
      provide: GET_BRANCH_SUMMARY,
      inject: [REPORTING_QUERIES, LABEL_SET_PROVIDER, IN_MEMORY_STORE],
      useFactory: (
        reporting: ReportingQueries,
        labelSets: LabelSetProvider,
        store: InMemoryStore,
      ) => new GetBranchSummary({ reporting, labelSets, clock: store.clock }),
    },
    {
      provide: GET_HEATMAP,
      inject: [REPORTING_QUERIES, IN_MEMORY_STORE],
      useFactory: (reporting: ReportingQueries, store: InMemoryStore) =>
        new GetHeatmap({ reporting, clock: store.clock }),
    },
    {
      provide: LIST_TOPICS,
      inject: [REPORTING_QUERIES, LABEL_SET_PROVIDER],
      useFactory: (reporting: ReportingQueries, labelSets: LabelSetProvider) =>
        new ListTopics({ reporting, labelSets }),
    },
    {
      provide: CLIENT_AUTHENTICATOR,
      inject: [B2B_ACCESS_TOKENS],
      useFactory: authenticatorFor,
    },
    ClientAuthGuard,
    {
      provide: DEMO_B2B_CLIENTS,
      inject: [B2B_CLIENT_REPOSITORY, SECRET_HASHER, IN_MEMORY_STORE],
      useFactory: (
        clients: B2bClientRepository,
        hasher: SecretHasher,
        store: InMemoryStore,
      ) => loadDemoB2bClients(process.env, { clients, hasher, uow: store.uow }),
    },
  ],
})
export class InsightsModule {}
