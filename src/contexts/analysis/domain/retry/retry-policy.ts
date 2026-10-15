/** A feedback is analyzed within this time of its submission, or closed as unanalyzed (FR-AI-05, FR-AI-09). */
export const ANALYSIS_WINDOW_MS = 24 * 60 * 60 * 1000;

const MINUTE = 60_000;
const FIRST_DELAY_MS = MINUTE;
const MAX_DELAY_MS = 60 * MINUTE;

/**
 * When to try again after a failed attempt (docs/06 §5.4): one minute, doubling, at most an hour
 * apart. Every attempt must happen before submittedAt + 24 hours, counted from the submission,
 * not from the first attempt; after that the 24-hour close takes over (FinalizeUnanalyzedFeedback).
 */
export class RetryPolicy {
  /** The analysis window of a feedback: attempts may run strictly before this time. */
  deadlineOf(submittedAt: Date): Date {
    return new Date(submittedAt.getTime() + ANALYSIS_WINDOW_MS);
  }

  /** May an attempt run now? */
  allowsAttemptAt(now: Date, submittedAt: Date): boolean {
    return now.getTime() < this.deadlineOf(submittedAt).getTime();
  }

  /**
   * The time of the next attempt after `failedAttempts` failures (1 or more) at `now`, or null when
   * it would fall at or after the deadline.
   */
  nextAttemptAt(
    failedAttempts: number,
    now: Date,
    submittedAt: Date,
  ): Date | null {
    const exponent = Math.max(failedAttempts - 1, 0);
    const delay = Math.min(FIRST_DELAY_MS * 2 ** exponent, MAX_DELAY_MS);
    const next = new Date(now.getTime() + delay);
    return this.allowsAttemptAt(next, submittedAt) ? next : null;
  }
}
