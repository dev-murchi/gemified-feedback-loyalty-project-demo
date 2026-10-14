import { RewardCooldown } from '../../../src/contexts/feedback/domain/reward-cooldown/reward-cooldown.js';
import { RewardLimits } from '../../../src/contexts/feedback/domain/reward-cooldown/reward-limits.js';
import {
  aCooldown,
  after,
  FEEDBACK_BRANCH_ID,
  FEEDBACK_USER_ID,
  feedbackId,
  reserved,
  T0,
} from '../../support/feedback-builders.js';

const rejectionOf = (cooldown: RewardCooldown, id: number, at: Date) => {
  const result = cooldown.reserve(feedbackId(id), at);
  return result.ok ? undefined : result.error;
};

describe('RewardCooldown', () => {
  describe('one pending feedback (FR-QR-07, TC-QR-06)', () => {
    it('rejects a new feedback while the previous one is analyzed, and changes nothing', () => {
      // Given a feedback that is still being analyzed
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);

      // When another is submitted
      const rejection = rejectionOf(cooldown, 2, after(0, 5));

      // Then it is FEEDBACK_PENDING, the first stays pending and no attempt was added
      expect(rejection).toEqual({ code: 'FEEDBACK_PENDING' });
      expect(cooldown.pendingFeedbackId).toBe(feedbackId(1));
      expect(cooldown.attemptTimes).toEqual([T0]);
    });

    it('reports a pending feedback before the cooldown or the attempt limit', () => {
      // Given a pending feedback, a recent reward and three attempts all at once
      const cooldown = RewardCooldown.reconstitute(
        {
          userId: FEEDBACK_USER_ID,
          branchId: FEEDBACK_BRANCH_ID,
          lastRewardedAt: after(0, 1),
          attemptTimes: [after(0, 1), after(0, 2), after(0, 3)],
          pendingFeedbackId: feedbackId(9),
        },
        1,
        RewardLimits.create({
          cooldownMs: 86_400_000,
          attemptWindowMs: 86_400_000,
          maxAttempts: 3,
        }),
      );

      // Then the first thing the user is told is that a feedback is pending
      expect(rejectionOf(cooldown, 10, after(1))?.code).toBe(
        'FEEDBACK_PENDING',
      );
    });
  });

  describe('24 hours after the last rewarded feedback (FR-QR-07)', () => {
    it('rejects at 23:59 with the 60 seconds left, and accepts at exactly 24:00 (TC-QR-02)', () => {
      // Given a feedback submitted at T and rewarded
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);
      cooldown.complete(feedbackId(1), 'rewarded', T0);

      // When a new one comes 23 hours 59 minutes later, and at 24 hours
      const early = rejectionOf(cooldown, 2, after(23, 59));
      const onTime = cooldown.reserve(feedbackId(2), after(24));

      // Then the first waits 60 seconds more; the second is accepted
      expect(early).toEqual({ code: 'REWARD_COOLDOWN', retryAfterSeconds: 60 });
      expect(onTime.ok).toBe(true);
    });

    it('counts from the submission time, not from when the analysis finished', () => {
      // Given a feedback submitted at T whose reward was applied 3 hours later
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);
      cooldown.complete(feedbackId(1), 'rewarded', T0);

      // Then the cooldown ends 24 hours after T, not after the analysis
      expect(cooldown.lastRewardedAt).toEqual(T0);
      expect(rejectionOf(cooldown, 2, after(24, 1))).toBeUndefined();
    });

    it('still rejects after the attempt window has emptied (TC-QR-03, regression of the one-window design)', () => {
      // Given a spam attempt at T, and a rewarded one at T+23h
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);
      cooldown.complete(feedbackId(1), 'not_rewarded', T0);
      reserved(cooldown, 2, after(23));
      cooldown.complete(feedbackId(2), 'rewarded', after(23));

      // When a new one comes at T+25h: the first attempt left the window an hour ago
      const rejection = rejectionOf(cooldown, 3, after(25));

      // Then the reward cooldown (until T+47h) still applies: 22 hours left
      expect(rejection).toEqual({
        code: 'REWARD_COOLDOWN',
        retryAfterSeconds: 22 * 3600,
      });
    });

    it('is reported before the attempt limit when both apply (pending, cooldown, attempts, in that order)', () => {
      // Given two spam attempts and then a rewarded third one, all within a few hours
      const cooldown = aCooldown();
      for (const [id, hours, outcome] of [
        [1, 0, 'not_rewarded'],
        [2, 1, 'not_rewarded'],
        [3, 2, 'rewarded'],
      ] as const) {
        reserved(cooldown, id, after(hours));
        cooldown.complete(feedbackId(id), outcome, after(hours));
      }

      // When a 4th comes an hour later: the reward cooldown and the attempt limit both apply
      const rejection = rejectionOf(cooldown, 4, after(3));

      // Then the user is told about the reward cooldown (23 hours left), the first rule in order
      expect(rejection).toEqual({
        code: 'REWARD_COOLDOWN',
        retryAfterSeconds: 23 * 3600,
      });
    });

    it('gives no reward right back for a valid low-trust feedback, so the next one is allowed', () => {
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);
      cooldown.complete(feedbackId(1), 'not_rewarded', T0);

      expect(cooldown.lastRewardedAt).toBeNull();
      expect(rejectionOf(cooldown, 2, after(1))).toBeUndefined();
    });
  });

  describe('at most 3 feedbacks in any 24 hours (FR-QR-09)', () => {
    const spam = (cooldown: RewardCooldown, id: number, at: Date) => {
      reserved(cooldown, id, at);
      cooldown.complete(feedbackId(id), 'not_rewarded', at);
    };

    it('lets spam use up the attempt without using up the reward right (TC-QR-04)', () => {
      // Given a spam verdict
      const cooldown = aCooldown();
      spam(cooldown, 1, T0);

      // When the user submits again
      const second = cooldown.reserve(feedbackId(2), after(1));

      // Then it is accepted, and two attempts count now
      expect(second.ok).toBe(true);
      expect(cooldown.attemptsWithin(after(1))).toBe(2);
    });

    it('rejects the 4th attempt in the window, with the wait until the first one leaves it (TC-QR-05)', () => {
      // Given three attempts, 1 hour apart
      const cooldown = aCooldown();
      spam(cooldown, 1, T0);
      spam(cooldown, 2, after(1));
      spam(cooldown, 3, after(2));

      // When a 4th comes 3 hours after the first
      const rejection = rejectionOf(cooldown, 4, after(3));

      // Then ATTEMPTS_EXHAUSTED: the first attempt leaves the window in 21 hours
      expect(rejection).toEqual({
        code: 'ATTEMPTS_EXHAUSTED',
        retryAfterSeconds: 21 * 3600,
      });
    });

    it('slides: attempts at T, T+23:58 and T+23:59 allow a 4th at T+24:01 but not a 5th at T+24:02 (TC-QR-09)', () => {
      // Given three attempts that were all analyzed as spam
      const cooldown = aCooldown();
      spam(cooldown, 1, T0);
      spam(cooldown, 2, after(23, 58));
      spam(cooldown, 3, after(23, 59));

      // When a 4th comes at T+24:01 (the first attempt is now older than 24 hours)
      const fourth = cooldown.reserve(feedbackId(4), after(24, 1));
      cooldown.complete(feedbackId(4), 'not_rewarded', after(24, 1));
      // And a 5th one minute later
      const fifth = rejectionOf(cooldown, 5, after(24, 2));

      // Then the 4th is accepted (2 attempts in the last 24 hours), the 5th is exhausted; a fixed
      // window would have accepted both
      expect(fourth.ok).toBe(true);
      expect(fifth?.code).toBe('ATTEMPTS_EXHAUSTED');
      // the oldest attempt in the window (T+23:58) leaves it at T+47:58, 23 h 56 min from now
      expect(fifth).toMatchObject({ retryAfterSeconds: 23 * 3600 + 56 * 60 });
    });

    it('does not count an attempt exactly one window old', () => {
      const cooldown = aCooldown();
      spam(cooldown, 1, T0);
      spam(cooldown, 2, after(1));
      spam(cooldown, 3, after(2));

      expect(rejectionOf(cooldown, 4, after(23, 59))?.code).toBe(
        'ATTEMPTS_EXHAUSTED',
      );
      expect(rejectionOf(cooldown, 4, after(24))).toBeUndefined();
    });

    it('does not count a rejected request as an attempt', () => {
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);
      rejectionOf(cooldown, 2, after(0, 1));
      rejectionOf(cooldown, 3, after(0, 2));

      expect(cooldown.attemptTimes).toEqual([T0]);
    });
  });

  describe('releasing the lock', () => {
    it('is done only by the pending feedback: a late job of an older one changes nothing (TC-QR-08)', () => {
      // Given feedback 1 finished, and feedback 2 pending
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);
      cooldown.complete(feedbackId(1), 'not_rewarded', T0);
      reserved(cooldown, 2, after(1));

      // When a late job of feedback 1 reports a reward
      const late = cooldown.complete(feedbackId(1), 'rewarded', T0);

      // Then it is ignored: 2 is still pending and no reward was recorded
      expect(late).toBe('ignored');
      expect(cooldown.pendingFeedbackId).toBe(feedbackId(2));
      expect(cooldown.lastRewardedAt).toBeNull();
    });

    it('is idempotent: completing twice changes nothing the second time', () => {
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);

      expect(cooldown.complete(feedbackId(1), 'rewarded', T0)).toBe(
        'completed',
      );
      expect(cooldown.complete(feedbackId(1), 'rewarded', after(5))).toBe(
        'ignored',
      );
      expect(cooldown.lastRewardedAt).toEqual(T0);
    });

    it('does nothing when nothing is pending', () => {
      expect(aCooldown().complete(feedbackId(1), 'rewarded', T0)).toBe(
        'ignored',
      );
    });
  });

  describe('configuration and values', () => {
    it('follows the configured limits', () => {
      // Given 1 hour between rewards and 2 attempts in 2 hours
      const limits = RewardLimits.create({
        cooldownMs: 3_600_000,
        attemptWindowMs: 7_200_000,
        maxAttempts: 2,
      });
      const cooldown = aCooldown(limits);
      reserved(cooldown, 1, T0);
      cooldown.complete(feedbackId(1), 'rewarded', T0);

      // Then the cooldown is 1 hour and the third attempt in 2 hours is refused
      expect(rejectionOf(cooldown, 2, after(0, 59))?.code).toBe(
        'REWARD_COOLDOWN',
      );
      reserved(cooldown, 2, after(1));
      cooldown.complete(feedbackId(2), 'not_rewarded', after(1));
      expect(rejectionOf(cooldown, 3, after(1, 30))?.code).toBe(
        'ATTEMPTS_EXHAUSTED',
      );
    });

    it('is new at version 0 and cannot be changed through the dates it returns', () => {
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);
      cooldown.complete(feedbackId(1), 'rewarded', T0);

      cooldown.attemptTimes[0]?.setFullYear(2000);
      cooldown.lastRewardedAt?.setFullYear(2000);

      expect(cooldown.version).toBe(0);
      expect(cooldown.attemptTimes).toEqual([T0]);
      expect(cooldown.lastRewardedAt).toEqual(T0);
    });
  });
});
