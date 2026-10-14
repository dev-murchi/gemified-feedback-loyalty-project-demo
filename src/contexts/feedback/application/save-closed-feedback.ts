import type { Feedback } from '../domain/feedback/feedback.js';
import type { CooldownOutcome } from '../domain/reward-cooldown/reward-cooldown.js';
import type { FeedbackRepository } from './ports/feedback-repository.js';
import type { RewardCooldownRepository } from './ports/reward-cooldown-repository.js';

export interface ClosingStores {
  readonly feedbacks: FeedbackRepository;
  readonly cooldowns: RewardCooldownRepository;
}

/**
 * The common end of ApplyAnalysisResult and FinalizeUnanalyzedFeedback, inside their unit of work:
 * the just-closed feedback releases its branch lock (only if it is still the pending one, so a late
 * job changes nothing, TC-QR-08), then both are saved. Saving the feedback publishes its
 * FeedbackValidated, so Gamification rewards it in the same transaction (docs/06 §7).
 */
export async function saveClosedFeedback(
  stores: ClosingStores,
  feedback: Feedback,
  outcome: CooldownOutcome,
): Promise<void> {
  const cooldown = await stores.cooldowns.find(
    feedback.userId,
    feedback.branchId,
  );
  if (cooldown === undefined)
    throw new Error(`Feedback ${feedback.id} has no reward cooldown`);
  const completed = cooldown.complete(
    feedback.id,
    outcome,
    feedback.submittedAt,
  );
  await stores.feedbacks.save(feedback);
  if (completed === 'completed') await stores.cooldowns.save(cooldown);
}
