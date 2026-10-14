// Fakes of the ports Feedback's use cases need from other contexts and of the cooldown repository,
// as plain objects (fakes, not mocks: docs/07 §9).

import type { RewardCooldownRepository } from '../../src/contexts/feedback/application/ports/reward-cooldown-repository.js';
import type { BranchDirectory } from '../../src/contexts/catalog/public/branch-directory.js';
import type {
  QrResolver,
  ResolvedQr,
} from '../../src/contexts/catalog/public/qr-resolver.js';
import type { FeedbackReward } from '../../src/contexts/gamification/public/reward-lookup.js';
import type { RewardLookup } from '../../src/contexts/gamification/public/reward-lookup.js';
import type {
  PlatformProofRequest,
  PlatformProofVerifier,
} from '../../src/contexts/identity/public/platform-proof-verifier.js';
import { ConcurrencyConflictError } from '../../src/shared-kernel/concurrency-conflict-error.js';
import type { BrandId } from '../../src/shared-kernel/ids.js';
import { err, ok } from '../../src/shared-kernel/result.js';
import {
  FEEDBACK_BRANCH_ID,
  OTHER_FEEDBACK_BRANCH_ID,
  QR_CODE_ID,
} from './feedback-builders.js';

export const QR_TOKEN = 'Kp3vX9qL2mT7wR4yB8nZ1cF6hJ0sD5aE';
export const OTHER_QR_TOKEN = 'Zz9vX9qL2mT7wR4yB8nZ1cF6hJ0sD5aQ';
export const BRANCH_NAME = 'Kadıköy Rıhtım';

const BRAND_ID = 'b0000000-0000-4000-8000-0000000000f1' as BrandId;

/** A QrResolver that knows two tokens of a fuel brand; a token in `revoked` is QR_INVALID. */
export interface FakeQrResolver extends QrResolver {
  readonly revoked: Set<string>;
}

export function fakeQrResolver(): FakeQrResolver {
  const known = new Map<string, ResolvedQr>([
    [
      QR_TOKEN,
      {
        qrCodeId: QR_CODE_ID,
        branchId: FEEDBACK_BRANCH_ID,
        brandId: BRAND_ID,
        sector: 'fuel',
      },
    ],
    [
      OTHER_QR_TOKEN,
      {
        qrCodeId: 'd0000000-0000-4000-8000-0000000000f2',
        branchId: OTHER_FEEDBACK_BRANCH_ID,
        brandId: BRAND_ID,
        sector: 'fuel',
      },
    ],
  ]);
  const revoked = new Set<string>();
  return {
    revoked,
    resolve: (token) => {
      const resolved = revoked.has(token) ? undefined : known.get(token);
      return Promise.resolve(
        resolved === undefined ? err({ code: 'QR_INVALID' }) : ok(resolved),
      );
    },
  };
}

/** A PlatformProofVerifier with a set verdict that records what it was asked. */
export interface FakeProofs extends PlatformProofVerifier {
  verdict: 'valid' | 'invalid';
  readonly requests: PlatformProofRequest[];
}

export function fakeProofs(): FakeProofs {
  const fake: FakeProofs = {
    verdict: 'valid',
    requests: [],
    verify: (request) => {
      fake.requests.push(request);
      return Promise.resolve(fake.verdict);
    },
  };
  return fake;
}

/** A BranchDirectory that names the feedback test branch only. */
export const fakeBranchDirectory = (): BranchDirectory => ({
  nameOf: (branchId) =>
    Promise.resolve(branchId === FEEDBACK_BRANCH_ID ? BRANCH_NAME : undefined),
});

/** A RewardLookup answering from `rewards`, keyed by feedback id. */
export interface FakeRewards extends RewardLookup {
  readonly rewards: Map<string, FeedbackReward>;
}

export function fakeRewards(): FakeRewards {
  const rewards = new Map<string, FeedbackReward>();
  return {
    rewards,
    rewardFor: (_userId, feedbackId) =>
      Promise.resolve(rewards.get(feedbackId)),
  };
}

/**
 * Wraps a cooldown repository: the first `conflicts` saves throw ConcurrencyConflictError, as if
 * another request had saved in between; `failure` makes every save throw that error instead.
 */
export function scriptedCooldowns(
  inner: RewardCooldownRepository,
  script: { conflicts?: number; failure?: Error },
): RewardCooldownRepository & { loads: number } {
  let conflictsLeft = script.conflicts ?? 0;
  const wrapper = {
    loads: 0,
    find: (...args: Parameters<RewardCooldownRepository['find']>) => {
      wrapper.loads += 1;
      return inner.find(...args);
    },
    save: (...args: Parameters<RewardCooldownRepository['save']>) => {
      if (script.failure !== undefined) return Promise.reject(script.failure);
      if (conflictsLeft === 0) return inner.save(...args);
      conflictsLeft -= 1;
      return Promise.reject(new ConcurrencyConflictError(args[0].userId));
    },
  };
  return wrapper;
}
