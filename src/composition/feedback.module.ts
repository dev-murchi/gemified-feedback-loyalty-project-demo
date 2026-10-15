import { Module } from '@nestjs/common';
import type { BranchDirectory } from '../contexts/catalog/public/branch-directory.js';
import type { QrResolver } from '../contexts/catalog/public/qr-resolver.js';
import { FeedbackController } from '../contexts/feedback/adapters/inbound/http/feedback.controller.js';
import {
  GET_FEEDBACK_STATUS,
  SUBMIT_FEEDBACK,
} from '../contexts/feedback/adapters/inbound/http/tokens.js';
import { LocalRawTextCipher } from '../contexts/feedback/adapters/outbound/local-raw-text.cipher.js';
import { MemoryFeedbackRepository } from '../contexts/feedback/adapters/outbound/memory-feedback.repository.js';
import { MemoryRewardCooldownRepository } from '../contexts/feedback/adapters/outbound/memory-reward-cooldown.repository.js';
import { NodeHasher } from '../contexts/feedback/adapters/outbound/node-hasher.js';
import { loadRawTextKey } from '../contexts/feedback/adapters/outbound/raw-text-key.js';
import type { FeedbackRepository } from '../contexts/feedback/application/ports/feedback-repository.js';
import type { RawTextCipher } from '../contexts/feedback/application/ports/raw-text-cipher.js';
import type { RewardCooldownRepository } from '../contexts/feedback/application/ports/reward-cooldown-repository.js';
import { ApplyAnalysisResult } from '../contexts/feedback/application/use-cases/apply-analysis-result.js';
import { GetFeedbackStatus } from '../contexts/feedback/application/use-cases/get-feedback-status.js';
import { SubmitFeedback } from '../contexts/feedback/application/use-cases/submit-feedback.js';
import { DEFAULT_REWARD_LIMITS } from '../contexts/feedback/domain/reward-cooldown/reward-limits.js';
import type { RewardLookup } from '../contexts/gamification/public/reward-lookup.js';
import type { PlatformProofVerifier } from '../contexts/identity/public/platform-proof-verifier.js';
import { CryptoRandomSource } from '../shared-kernel/adapters/crypto-random-source.js';
import type { Logger } from '../shared-kernel/logger.js';
import { AuthenticationModule } from './authentication.module.js';
import { CatalogModule } from './catalog.module.js';
import { GamificationModule } from './gamification.module.js';
import { IdentityModule } from './identity.module.js';
import type { InMemoryStore } from './in-memory-store.js';
import {
  APPLY_ANALYSIS_RESULT,
  BRANCH_DIRECTORY,
  FEEDBACK_REPOSITORY,
  IN_MEMORY_STORE,
  LOGGER,
  PLATFORM_PROOF_VERIFIER,
  QR_RESOLVER,
  RAW_TEXT_CIPHER,
  REWARD_COOLDOWN_REPOSITORY,
  REWARD_LOOKUP,
} from './tokens.js';

const random = new CryptoRandomSource();

/**
 * Feedback wiring (in-memory until S0-11). The raw-text master key comes from RAW_TEXT_KEY and
 * RAW_TEXT_KEY_ID and is required in production. Exports ApplyAnalysisResult, which only
 * event-routes.ts registers; the repositories stay inside the module.
 */
@Module({
  imports: [
    CatalogModule,
    GamificationModule,
    IdentityModule,
    AuthenticationModule,
  ],
  controllers: [FeedbackController],
  providers: [
    {
      provide: FEEDBACK_REPOSITORY,
      inject: [IN_MEMORY_STORE],
      useFactory: (store: InMemoryStore) =>
        new MemoryFeedbackRepository({
          table: store.feedback.feedbacks,
          events: store.uow,
        }),
    },
    {
      provide: REWARD_COOLDOWN_REPOSITORY,
      inject: [IN_MEMORY_STORE],
      useFactory: (store: InMemoryStore) =>
        new MemoryRewardCooldownRepository({
          table: store.feedback.cooldowns,
          events: store.uow,
          limits: DEFAULT_REWARD_LIMITS,
        }),
    },
    {
      provide: RAW_TEXT_CIPHER,
      inject: [LOGGER],
      useFactory: (logger: Logger) =>
        new LocalRawTextCipher({
          masterKey: loadRawTextKey(
            {
              nodeEnv: process.env['NODE_ENV'],
              keyBase64: process.env['RAW_TEXT_KEY'],
              keyId: process.env['RAW_TEXT_KEY_ID'],
            },
            { random, logger },
          ),
          random,
        }),
    },
    {
      provide: SUBMIT_FEEDBACK,
      inject: [
        FEEDBACK_REPOSITORY,
        REWARD_COOLDOWN_REPOSITORY,
        QR_RESOLVER,
        PLATFORM_PROOF_VERIFIER,
        RAW_TEXT_CIPHER,
        IN_MEMORY_STORE,
        LOGGER,
      ],
      useFactory: (
        ...[feedbacks, cooldowns, qrCodes, proofs, cipher, store, logger]: [
          FeedbackRepository,
          RewardCooldownRepository,
          QrResolver,
          PlatformProofVerifier,
          RawTextCipher,
          InMemoryStore,
          Logger,
        ]
      ) =>
        new SubmitFeedback({
          feedbacks,
          cooldowns,
          limits: DEFAULT_REWARD_LIMITS,
          qrCodes,
          proofs,
          cipher,
          hasher: new NodeHasher(),
          uow: store.uow,
          ids: store.ids,
          clock: store.clock,
          logger,
        }),
    },
    {
      provide: GET_FEEDBACK_STATUS,
      inject: [FEEDBACK_REPOSITORY, BRANCH_DIRECTORY, REWARD_LOOKUP],
      useFactory: (
        feedbacks: FeedbackRepository,
        branches: BranchDirectory,
        rewards: RewardLookup,
      ) => new GetFeedbackStatus({ feedbacks, branches, rewards }),
    },
    {
      provide: APPLY_ANALYSIS_RESULT,
      inject: [FEEDBACK_REPOSITORY, REWARD_COOLDOWN_REPOSITORY],
      useFactory: (
        feedbacks: FeedbackRepository,
        cooldowns: RewardCooldownRepository,
      ) => new ApplyAnalysisResult({ feedbacks, cooldowns }),
    },
  ],
  exports: [APPLY_ANALYSIS_RESULT],
})
export class FeedbackModule {}
