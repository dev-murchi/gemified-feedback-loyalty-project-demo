import type { RateLimitPolicy } from './rate-limiter.js';

/**
 * Slack for floating-point sums: with a fractional interval (180 per minute is 333.33… ms) a request
 * that is exactly on time can come out a few nanoseconds early. The Redis script uses the same value.
 */
export const EPSILON_MS = 0.01;

export type GcraResult =
  | { readonly allowed: true; readonly tat: number }
  | { readonly allowed: false; readonly waitMs: number };

/**
 * GCRA (the generic cell rate algorithm, as a token bucket without a counter): `tat` is the
 * "theoretical arrival time", the moment the bucket would be empty again. Each request moves it
 * forward by one interval (60 000 / perMinute ms). A request is allowed while the new `tat` is at
 * most `burst` intervals ahead of now, so `burst` requests may arrive together, and after that one
 * request per interval. A refused request does not move `tat`. Idle for `burst` intervals means a
 * full bucket again, and never more than `burst`.
 */
export function gcra(
  stored: number | undefined,
  nowMs: number,
  policy: RateLimitPolicy,
): GcraResult {
  const interval = 60_000 / policy.perMinute;
  const next = Math.max(stored ?? nowMs, nowMs) + interval;
  const waitMs = next - policy.burst * interval - nowMs;
  return waitMs > EPSILON_MS
    ? { allowed: false, waitMs }
    : { allowed: true, tat: next };
}

/** Whole seconds a client must wait, never less than 1 (`Retry-After: 0` would invite a retry storm). */
export const retryAfterSecondsOf = (waitMs: number): number =>
  Math.max(1, Math.ceil(waitMs / 1000));
