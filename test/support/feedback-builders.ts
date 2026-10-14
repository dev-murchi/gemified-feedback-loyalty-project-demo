// Small builders for Feedback tests.

import {
  Feedback,
  type NewFeedback,
} from '../../src/contexts/feedback/domain/feedback/feedback.js';
import type { EncryptedRawText } from '../../src/contexts/feedback/domain/feedback/raw-text.js';
import type { IdempotencyKey } from '../../src/contexts/feedback/domain/idempotency-key.js';
import type { RequestFingerprint } from '../../src/contexts/feedback/domain/request-fingerprint.js';
import { RewardCooldown } from '../../src/contexts/feedback/domain/reward-cooldown/reward-cooldown.js';
import {
  DEFAULT_REWARD_LIMITS,
  type RewardLimits,
} from '../../src/contexts/feedback/domain/reward-cooldown/reward-limits.js';
import type {
  BranchId,
  FeedbackId,
  UserId,
} from '../../src/shared-kernel/ids.js';

export const FEEDBACK_USER_ID =
  'a0000000-0000-4000-8000-0000000000f1' as UserId;
export const FEEDBACK_BRANCH_ID =
  'c0000000-0000-4000-8000-0000000000f1' as BranchId;
export const OTHER_FEEDBACK_BRANCH_ID =
  'c0000000-0000-4000-8000-0000000000f2' as BranchId;

/** The start of every time line in the reward rule tests. */
export const T0 = new Date('2026-10-14T09:00:00.000Z');

/** `hours` and `minutes` after T0. */
export const after = (hours: number, minutes = 0): Date =>
  new Date(T0.getTime() + (hours * 60 + minutes) * 60_000);

/** Feedback ids f0000000-…-0000000000f1, …f2, … */
export const feedbackId = (n: number): FeedbackId =>
  `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}` as FeedbackId;

/** A cooldown of FEEDBACK_USER_ID at FEEDBACK_BRANCH_ID before their first feedback there. */
export const aCooldown = (
  limits: RewardLimits = DEFAULT_REWARD_LIMITS,
): RewardCooldown =>
  RewardCooldown.open(
    { userId: FEEDBACK_USER_ID, branchId: FEEDBACK_BRANCH_ID },
    limits,
  );

/** Reserves, expecting success; for set-up steps that are not the thing under test. */
export function reserved(cooldown: RewardCooldown, id: number, at: Date): void {
  const result = cooldown.reserve(feedbackId(id), at);
  if (!result.ok)
    throw new Error(`set-up reserve was rejected: ${result.error.code}`);
}

export const IDEMPOTENCY_KEY =
  '11111111-1111-4111-8111-111111111111' as IdempotencyKey;
export const OTHER_IDEMPOTENCY_KEY =
  '22222222-2222-4222-8222-222222222222' as IdempotencyKey;
export const QR_CODE_ID = 'd0000000-0000-4000-8000-0000000000f1';
export const FINGERPRINT = 'a'.repeat(64) as RequestFingerprint;

/** Not real ciphertext: the aggregate only carries it. */
export const RAW_TEXT: EncryptedRawText = {
  ciphertext: 'Y2lwaGVydGV4dA==',
  encryptedDataKey: 'd3JhcHBlZEtleQ==',
  keyId: 'test-key',
};

/** A comment submitted at T0 by FEEDBACK_USER_ID at FEEDBACK_BRANCH_ID, with normal trust. */
export const aNewFeedback = (
  overrides: Partial<NewFeedback> = {},
): NewFeedback => ({
  id: feedbackId(1),
  userId: FEEDBACK_USER_ID,
  branchId: FEEDBACK_BRANCH_ID,
  qrCodeId: QR_CODE_ID,
  sector: 'fuel',
  idempotencyKey: IDEMPOTENCY_KEY,
  requestFingerprint: FINGERPRINT,
  rewardEligible: true,
  correlationId: 'req-1',
  submittedAt: T0,
  rawText: RAW_TEXT,
  ...overrides,
});

export const aFeedback = (overrides: Partial<NewFeedback> = {}): Feedback =>
  Feedback.submit(aNewFeedback(overrides));
