import { Module } from '@nestjs/common';
import type { BranchDirectory } from '../contexts/catalog/public/branch-directory.js';
import type { QrResolver } from '../contexts/catalog/public/qr-resolver.js';
import { FeedbackController } from '../contexts/feedback/adapters/inbound/http/feedback.controller.js';
import {
  GET_FEEDBACK_STATUS,
  SUBMIT_FEEDBACK,
} from '../contexts/feedback/adapters/inbound/http/tokens.js';
import { NodeHasher } from '../contexts/feedback/adapters/outbound/node-hasher.js';
import type { FeedbackRepository } from '../contexts/feedback/application/ports/feedback-repository.js';
import type { RawTextCipher } from '../contexts/feedback/application/ports/raw-text-cipher.js';
import type { RewardCooldownRepository } from '../contexts/feedback/application/ports/reward-cooldown-repository.js';
import { GetFeedbackStatus } from '../contexts/feedback/application/use-cases/get-feedback-status.js';
import { SubmitFeedback } from '../contexts/feedback/application/use-cases/submit-feedback.js';
import { DEFAULT_REWARD_LIMITS } from '../contexts/feedback/domain/reward-cooldown/reward-limits.js';
import type { RewardLookup } from '../contexts/gamification/public/reward-lookup.js';
import type { PlatformProofVerifier } from '../contexts/identity/public/platform-proof-verifier.js';
import type { Logger } from '../shared-kernel/logger.js';
import { AuthenticationModule } from './authentication.module.js';
import { CatalogModule } from './catalog.module.js';
import { FeedbackModule } from './feedback.module.js';
import { GamificationModule } from './gamification.module.js';
import { IdentityModule } from './identity.module.js';
import type { InMemoryStore } from './in-memory-store.js';
import {
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

/**
 * The HTTP side of Feedback: `POST /v1/feedbacks` and `GET /v1/feedbacks/{feedbackId}`. It needs
 * Identity (the request proof and the bearer guard), so only the API loads it; the worker does not
 * (NFR-SEC-06).
 */
@Module({
  imports: [
    FeedbackModule,
    CatalogModule,
    GamificationModule,
    IdentityModule,
    AuthenticationModule,
  ],
  controllers: [FeedbackController],
  providers: [
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
  ],
})
export class FeedbackHttpModule {}
