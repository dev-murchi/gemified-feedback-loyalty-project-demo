import type { Clock } from '../../../shared-kernel/clock.js';
import { err, type Result } from '../../../shared-kernel/result.js';
import { Challenge } from '../domain/challenge/challenge.js';
import { Nonce, type ChallengeInvalid } from '../domain/challenge/nonce.js';
import type { ChallengeStore } from './ports/challenge-store.js';

/**
 * Uses up a challenge (FR-AUTH-03, T-S4). Unknown, used, expired and malformed nonces are the same
 * answer, CHALLENGE_INVALID, and the nonce stays used whatever the caller does next.
 */
export async function takeLiveNonce(
  deps: { readonly challenges: ChallengeStore; readonly clock: Clock },
  raw: string,
): Promise<Result<Nonce, ChallengeInvalid>> {
  const parsed = Nonce.parse(raw);
  if (!parsed.ok) return parsed;
  const challenge = await deps.challenges.take(parsed.value);
  const live =
    challenge !== undefined && Challenge.isLiveAt(challenge, deps.clock.now());
  return live ? parsed : err({ code: 'CHALLENGE_INVALID' });
}
