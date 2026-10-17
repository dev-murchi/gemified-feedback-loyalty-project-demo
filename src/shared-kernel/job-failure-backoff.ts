/**
 * How a queue retries a job whose handler threw (S0-10: no hot loop): 1 minute, doubling, at most
 * 30 minutes apart, 5 attempts in all, then the job is marked failed and never run again. A failed
 * analysis job is not lost: the 24-hour sweeper still closes its feedback (FR-AI-09).
 */
export const JOB_FAILURE_BACKOFF = {
  maxAttempts: 5,
  firstDelayMs: 60_000,
  maxDelayMs: 30 * 60_000,
} as const;

/** The wait before the next attempt after `failedAttempts` failures (1 or more). */
export function failureDelayMs(failedAttempts: number): number {
  const exponent = Math.max(failedAttempts - 1, 0);
  return Math.min(
    JOB_FAILURE_BACKOFF.firstDelayMs * 2 ** exponent,
    JOB_FAILURE_BACKOFF.maxDelayMs,
  );
}

/** True when this many failures used up every attempt. */
export const attemptsExhausted = (failedAttempts: number): boolean =>
  failedAttempts >= JOB_FAILURE_BACKOFF.maxAttempts;
