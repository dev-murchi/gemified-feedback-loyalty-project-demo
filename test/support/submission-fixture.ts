import { createSecretKey, randomBytes } from 'node:crypto';
import { LocalRawTextCipher } from '../../src/contexts/feedback/adapters/outbound/local-raw-text.cipher.js';
import { NodeHasher } from '../../src/contexts/feedback/adapters/outbound/node-hasher.js';
import type { RewardCooldownRepository } from '../../src/contexts/feedback/application/ports/reward-cooldown-repository.js';
import { GetFeedbackStatus } from '../../src/contexts/feedback/application/use-cases/get-feedback-status.js';
import {
  SubmitFeedback,
  type SubmitFeedbackCommand,
} from '../../src/contexts/feedback/application/use-cases/submit-feedback.js';
import { DEFAULT_REWARD_LIMITS } from '../../src/contexts/feedback/domain/reward-cooldown/reward-limits.js';
import { CryptoRandomSource } from '../../src/shared-kernel/adapters/crypto-random-source.js';
import { FakeClock } from './fake-clock.js';
import { FEEDBACK_USER_ID, IDEMPOTENCY_KEY, T0 } from './feedback-builders.js';
import {
  fakeBranchDirectory,
  fakeProofs,
  fakeQrResolver,
  fakeRewards,
  QR_TOKEN,
  type FakeProofs,
  type FakeQrResolver,
  type FakeRewards,
} from './feedback-fakes.js';
import {
  memoryFeedbackHarness,
  type FeedbackHarness,
} from './memory-feedback.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';

export const COMMENT = 'Tuvaletler çok kirliydi, sabun da yoktu.';

/** The raw body a client sends for this token and text. */
export const bodyOf = (text = COMMENT, qrToken = QR_TOKEN): Buffer =>
  Buffer.from(JSON.stringify({ qrToken, text }), 'utf8');

/** A normal-trust submission of COMMENT at QR_TOKEN by FEEDBACK_USER_ID. */
export function aSubmission(
  overrides: Partial<SubmitFeedbackCommand> = {},
): SubmitFeedbackCommand {
  const text = overrides.text ?? COMMENT;
  const qrToken = overrides.qrToken ?? QR_TOKEN;
  return {
    userId: FEEDBACK_USER_ID,
    keyIdentifier: 'Yz7kQ2mF9xR4tW1vB6nH3jL8pD5sA0gE2cU7iO4yT1q',
    trustLevel: 'normal',
    idempotencyKey: IDEMPOTENCY_KEY,
    qrToken,
    text,
    body: bodyOf(text, qrToken),
    platformProof: 'cHJvb2Y=',
    correlationId: 'req-1',
    ...overrides,
  };
}

export interface SubmissionFixture {
  readonly harness: FeedbackHarness;
  readonly clock: FakeClock;
  readonly qrCodes: FakeQrResolver;
  readonly proofs: FakeProofs;
  readonly rewards: FakeRewards;
  readonly cipher: LocalRawTextCipher;
  readonly submit: SubmitFeedback;
  readonly status: GetFeedbackStatus;
}

/** SubmitFeedback and GetFeedbackStatus on in-memory adapters, a real cipher, and fakes for others. */
export async function submissionFixture(
  options: {
    wrapCooldowns?: (
      inner: RewardCooldownRepository,
    ) => RewardCooldownRepository;
  } = {},
): Promise<SubmissionFixture> {
  const harness = await memoryFeedbackHarness();
  const clock = new FakeClock(T0);
  const qrCodes = fakeQrResolver();
  const proofs = fakeProofs();
  const rewards = fakeRewards();
  const cipher = new LocalRawTextCipher({
    masterKey: { key: createSecretKey(randomBytes(32)), keyId: 'test' },
    random: new CryptoRandomSource(),
  });
  const submit = new SubmitFeedback({
    feedbacks: harness.feedbacks,
    cooldowns: options.wrapCooldowns?.(harness.cooldowns) ?? harness.cooldowns,
    limits: DEFAULT_REWARD_LIMITS,
    qrCodes,
    proofs,
    cipher,
    hasher: new NodeHasher(),
    uow: harness.uow,
    ids: new SequentialIdGenerator(),
    clock,
  });
  const status = new GetFeedbackStatus({
    feedbacks: harness.feedbacks,
    branches: fakeBranchDirectory(),
    rewards,
  });
  return { harness, clock, qrCodes, proofs, rewards, cipher, submit, status };
}
