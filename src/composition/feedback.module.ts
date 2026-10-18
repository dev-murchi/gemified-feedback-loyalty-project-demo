import { Module } from '@nestjs/common';
import { LocalRawTextCipher } from '../contexts/feedback/adapters/outbound/local-raw-text.cipher.js';
import { MemoryFeedbackRepository } from '../contexts/feedback/adapters/outbound/memory-feedback.repository.js';
import { MemoryRewardCooldownRepository } from '../contexts/feedback/adapters/outbound/memory-reward-cooldown.repository.js';
import { loadRawTextKey } from '../contexts/feedback/adapters/outbound/raw-text-key.js';
import type { FeedbackRepository } from '../contexts/feedback/application/ports/feedback-repository.js';
import type { RawTextCipher } from '../contexts/feedback/application/ports/raw-text-cipher.js';
import type { RewardCooldownRepository } from '../contexts/feedback/application/ports/reward-cooldown-repository.js';
import { ApplyAnalysisResult } from '../contexts/feedback/application/use-cases/apply-analysis-result.js';
import { ReadRawText } from '../contexts/feedback/application/use-cases/read-raw-text.js';
import { DEFAULT_REWARD_LIMITS } from '../contexts/feedback/domain/reward-cooldown/reward-limits.js';
import { CryptoRandomSource } from '../shared-kernel/adapters/crypto-random-source.js';
import type { Logger } from '../shared-kernel/logger.js';
import type { InMemoryStore } from './in-memory-store.js';
import {
  APPLY_ANALYSIS_RESULT,
  FEEDBACK_REPOSITORY,
  IN_MEMORY_STORE,
  LOGGER,
  RAW_TEXT_CIPHER,
  RAW_TEXT_SOURCE,
  REWARD_COOLDOWN_REPOSITORY,
} from './tokens.js';

const random = new CryptoRandomSource();

/**
 * Feedback wiring that the API and the worker share (in-memory until S0-11): the repositories, the
 * raw-text cipher, ApplyAnalysisResult and RawTextSource. The raw-text master key comes from
 * RAW_TEXT_KEY and RAW_TEXT_KEY_ID and is required in production. It has no controller and needs no
 * other context's module, so the worker can load it without any API-only secret (NFR-SEC-06); the
 * HTTP side is in feedback-http.module.ts. ApplyAnalysisResult is registered only by
 * event-routes.ts. The repositories and the cipher are exported for the sweeper module and the
 * HTTP module, which need Feedback together with other contexts.
 */
@Module({
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
      provide: RAW_TEXT_SOURCE,
      inject: [FEEDBACK_REPOSITORY, RAW_TEXT_CIPHER],
      useFactory: (feedbacks: FeedbackRepository, cipher: RawTextCipher) =>
        new ReadRawText({ feedbacks, cipher }),
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
  // The repositories are exported for the sweeper module only: it needs Feedback and Analysis
  // together, so it is wired outside both (sweeper.module.ts).
  exports: [
    APPLY_ANALYSIS_RESULT,
    RAW_TEXT_SOURCE,
    FEEDBACK_REPOSITORY,
    REWARD_COOLDOWN_REPOSITORY,
    RAW_TEXT_CIPHER,
  ],
})
export class FeedbackModule {}
