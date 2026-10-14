import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import type { RewardCooldown } from '../../../src/contexts/feedback/domain/reward-cooldown/reward-cooldown.js';
import {
  aCooldown,
  after,
  FEEDBACK_BRANCH_ID,
  FEEDBACK_USER_ID,
  feedbackId,
  OTHER_FEEDBACK_BRANCH_ID,
  reserved,
  T0,
} from '../../support/feedback-builders.js';
import type { FeedbackHarness } from '../../support/memory-feedback.js';
import { versionedRepositoryContract } from '../support/versioned-repository.contract.js';

/** Everything a stored cooldown must give back, compared as plain data. */
const stateOf = (cooldown: RewardCooldown | undefined) =>
  cooldown && {
    userId: cooldown.userId,
    branchId: cooldown.branchId,
    lastRewardedAt: cooldown.lastRewardedAt,
    attemptTimes: cooldown.attemptTimes,
    pendingFeedbackId: cooldown.pendingFeedbackId,
  };

export function rewardCooldownRepositoryContract(
  makeHarness: () => Promise<FeedbackHarness>,
): void {
  describe('versioning', () => {
    versionedRepositoryContract(async () => {
      const harness = await makeHarness();
      return {
        uow: harness.uow,
        newAggregate: () => aCooldown(),
        save: (cooldown) => harness.cooldowns.save(cooldown),
        load: () =>
          harness.cooldowns.find(FEEDBACK_USER_ID, FEEDBACK_BRANCH_ID),
        dispose: () => harness.dispose(),
      };
    });
  });

  describe('storage', () => {
    let harness: FeedbackHarness;
    const save = (cooldown: RewardCooldown) =>
      harness.uow.run(() => harness.cooldowns.save(cooldown));
    const load = () =>
      harness.cooldowns.find(FEEDBACK_USER_ID, FEEDBACK_BRANCH_ID);

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(() => harness.dispose());

    it('is not found before the first feedback of this user at this branch', async () => {
      expect(await load()).toBeUndefined();
    });

    it('loads exactly what was saved: reward time, attempt log and pending feedback', async () => {
      // Given a cooldown with a rewarded feedback, a spam one and a pending one
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);
      cooldown.complete(feedbackId(1), 'rewarded', T0);
      reserved(cooldown, 2, after(25));
      cooldown.complete(feedbackId(2), 'not_rewarded', after(25));
      reserved(cooldown, 3, after(26));

      // When it is saved and loaded
      await save(cooldown);

      // Then the loaded cooldown has the same state
      expect(stateOf(await load())).toEqual(stateOf(cooldown));
    });

    it('keeps a separate cooldown per branch and per user', async () => {
      // Given a pending feedback at one branch
      const cooldown = aCooldown();
      reserved(cooldown, 1, T0);
      await save(cooldown);

      // Then another branch of the same user has nothing
      expect(
        await harness.cooldowns.find(
          FEEDBACK_USER_ID,
          OTHER_FEEDBACK_BRANCH_ID,
        ),
      ).toBeUndefined();
    });

    it('lets only one of two requests that both found nothing win (TC-QR-01)', async () => {
      // Given two requests that both loaded no cooldown and both passed the rules
      const first = aCooldown();
      const second = aCooldown();
      reserved(first, 1, T0);
      reserved(second, 2, T0);

      // When both are saved
      await save(first);
      const run = save(second);

      // Then the second conflicts instead of overwriting the first one's pending feedback
      await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
      expect((await load())?.pendingFeedbackId).toBe(feedbackId(1));
    });

    it('answers FEEDBACK_PENDING to the loser when it reloads and tries again', async () => {
      // Given a stored pending feedback, and a request that loses the race
      const first = aCooldown();
      reserved(first, 1, T0);
      await save(first);
      const reloaded = await load();
      if (reloaded === undefined) throw new Error('cooldown is not stored');

      // When the loser tries its feedback on the fresh state
      const result = reloaded.reserve(feedbackId(2), T0);

      // Then the rule rejects it
      expect(result).toEqual({
        ok: false,
        error: { code: 'FEEDBACK_PENDING' },
      });
    });
  });
}
