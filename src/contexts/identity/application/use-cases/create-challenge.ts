import type { Clock } from '../../../../shared-kernel/clock.js';
import type { RandomSource } from '../../../../shared-kernel/random-source.js';
import { Challenge } from '../../domain/challenge/challenge.js';
import type { ChallengeStore } from '../ports/challenge-store.js';

export interface CreateChallengeDeps {
  readonly challenges: ChallengeStore;
  readonly random: RandomSource;
  readonly clock: Clock;
}

/**
 * Issues a single-use challenge for registration or a session (FR-AUTH-03, `POST
 * /v1/auth/challenge`). It cannot fail as a business outcome, so it returns no Result.
 */
export class CreateChallenge {
  constructor(private readonly deps: CreateChallengeDeps) {}

  async execute(): Promise<Challenge> {
    const challenge = Challenge.issue(this.deps.random, this.deps.clock.now());
    await this.deps.challenges.save(challenge);
    return challenge;
  }
}
