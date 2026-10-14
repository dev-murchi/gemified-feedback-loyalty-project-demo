// The reward rules against a second, independent formulation (SDD 6.4, TC-QR-02..09): the oracle
// keeps the whole history and applies the rules to it, the aggregate keeps a pruned sliding log.
// They must agree on every answer, for any sequence of submissions, completions and late jobs.

import * as fc from 'fast-check';
import { RewardCooldown } from '../../../src/contexts/feedback/domain/reward-cooldown/reward-cooldown.js';
import { DEFAULT_REWARD_LIMITS } from '../../../src/contexts/feedback/domain/reward-cooldown/reward-limits.js';
import {
  aCooldown,
  FEEDBACK_BRANCH_ID,
  FEEDBACK_USER_ID,
  feedbackId,
  T0,
} from '../../support/feedback-builders.js';

const { cooldownMs, attemptWindowMs, maxAttempts } = DEFAULT_REWARD_LIMITS;

type Code =
  'FEEDBACK_PENDING' | 'REWARD_COOLDOWN' | 'ATTEMPTS_EXHAUSTED' | 'ok';

/** The rules written straight from the requirements, over the complete history. */
class Oracle {
  readonly accepted: number[] = [];
  readonly rewarded: number[] = [];
  pending: { id: number; at: number } | null = null;

  reserve(id: number, now: number): Code {
    if (this.pending !== null) return 'FEEDBACK_PENDING';
    const last = this.rewarded.at(-1);
    if (last !== undefined && now - last < cooldownMs) return 'REWARD_COOLDOWN';
    const inWindow = this.accepted.filter(
      (time) => now - time < attemptWindowMs,
    );
    if (inWindow.length >= maxAttempts) return 'ATTEMPTS_EXHAUSTED';
    this.accepted.push(now);
    this.pending = { id, at: now };
    return 'ok';
  }

  complete(id: number, outcome: 'rewarded' | 'not_rewarded'): void {
    if (this.pending?.id !== id) return;
    if (outcome === 'rewarded') this.rewarded.push(this.pending.at);
    this.pending = null;
  }
}

type Operation =
  | { readonly kind: 'submit'; readonly wait: number }
  | {
      readonly kind: 'finish';
      readonly wait: number;
      readonly rewarded: boolean;
    }
  | {
      readonly kind: 'late';
      readonly wait: number;
      readonly rewarded: boolean;
    };

const wait = fc.oneof(
  fc.integer({ min: 0, max: 3_600_000 }),
  fc.integer({ min: 0, max: 40 * 3_600_000 }),
);

const operation: fc.Arbitrary<Operation> = fc.oneof(
  {
    weight: 5,
    arbitrary: wait.map((w): Operation => ({ kind: 'submit', wait: w })),
  },
  {
    weight: 3,
    arbitrary: fc.tuple(wait, fc.boolean()).map(([w, rewarded]): Operation => ({
      kind: 'finish',
      wait: w,
      rewarded,
    })),
  },
  {
    weight: 1,
    arbitrary: fc
      .tuple(wait, fc.boolean())
      .map(([w, rewarded]): Operation => ({ kind: 'late', wait: w, rewarded })),
  },
);

/** A copy of the aggregate's state, to ask "what if it were later?" without changing the original. */
const copyOf = (cooldown: RewardCooldown): RewardCooldown =>
  RewardCooldown.reconstitute(
    {
      userId: FEEDBACK_USER_ID,
      branchId: FEEDBACK_BRANCH_ID,
      lastRewardedAt: cooldown.lastRewardedAt,
      attemptTimes: cooldown.attemptTimes,
      pendingFeedbackId: cooldown.pendingFeedbackId,
    },
    0,
    DEFAULT_REWARD_LIMITS,
  );

const codeOf = (result: ReturnType<RewardCooldown['reserve']>): Code =>
  result.ok ? 'ok' : result.error.code;

describe('RewardCooldown against an oracle with the full history', () => {
  it('agrees with the oracle on every answer, and every wait is exact', () => {
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 40 }), (operations) => {
        const cooldown = aCooldown();
        const oracle = new Oracle();
        let now = T0.getTime();
        let lastId = 0;

        for (const step of operations) {
          now += step.wait;
          if (step.kind === 'submit') {
            lastId += 1;
            const expected = oracle.reserve(lastId, now);
            const result = cooldown.reserve(feedbackId(lastId), new Date(now));
            expect(codeOf(result)).toBe(expected);
            if (!result.ok) assertExactWait(cooldown, result.error, now);
          } else if (step.kind === 'finish' && oracle.pending !== null) {
            const { id, at } = oracle.pending;
            const outcome = step.rewarded ? 'rewarded' : 'not_rewarded';
            oracle.complete(id, outcome);
            expect(
              cooldown.complete(feedbackId(id), outcome, new Date(at)),
            ).toBe('completed');
          } else if (step.kind === 'late') {
            // a job of a feedback that is not the pending one must change nothing
            const stale = feedbackId(lastId + 1000);
            const before = cooldown.pendingFeedbackId;
            expect(
              cooldown.complete(
                stale,
                step.rewarded ? 'rewarded' : 'not_rewarded',
                new Date(now),
              ),
            ).toBe('ignored');
            expect(cooldown.pendingFeedbackId).toBe(before);
          }
          // the log never holds more than the limit
          expect(cooldown.attemptsWithin(new Date(now))).toBeLessThanOrEqual(
            maxAttempts,
          );
        }
      }),
      { numRuns: 300 },
    );
  });
});

/** The wait ends exactly then: at the given time the rejection is gone, one second earlier not. */
function assertExactWait(
  cooldown: RewardCooldown,
  rejection: { code: string; retryAfterSeconds?: number },
  now: number,
): void {
  if (rejection.retryAfterSeconds === undefined) return;
  const wait = rejection.retryAfterSeconds;
  expect(wait).toBeGreaterThanOrEqual(1);
  const later = codeOf(
    copyOf(cooldown).reserve(feedbackId(1), new Date(now + wait * 1000)),
  );
  expect(later).not.toBe(rejection.code);
  if (wait > 1) {
    const earlier = codeOf(
      copyOf(cooldown).reserve(
        feedbackId(1),
        new Date(now + (wait - 1) * 1000),
      ),
    );
    expect(earlier).toBe(rejection.code);
  }
}
