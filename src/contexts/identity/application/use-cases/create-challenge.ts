import type { Clock } from '../../../../shared-kernel/clock.js';
import type { RandomSource } from '../../../../shared-kernel/random-source.js';
import { ok, type Result } from '../../../../shared-kernel/result.js';
import { Challenge } from '../../domain/challenge/challenge.js';
import type { TooManyChallenges } from '../../domain/challenge/challenge-errors.js';
import type { ChallengeStore } from '../ports/challenge-store.js';

export interface CreateChallengeDeps {
  readonly challenges: ChallengeStore;
  readonly random: RandomSource;
  readonly clock: Clock;
}

/**
 * Issues a single-use challenge for registration or a session (FR-AUTH-03, `POST
 * /v1/auth/challenge`). The store holds a limited number of waiting challenges; when it is full the
 * answer is RATE_LIMITED with the time to wait.
 */
export class CreateChallenge {
  constructor(private readonly deps: CreateChallengeDeps) {}

  async execute(): Promise<Result<Challenge, TooManyChallenges>> {
    const challenge = Challenge.issue(this.deps.random, this.deps.clock.now());
    const saved = await this.deps.challenges.save(challenge);
    return saved.ok ? ok(challenge) : saved;
  }
}
