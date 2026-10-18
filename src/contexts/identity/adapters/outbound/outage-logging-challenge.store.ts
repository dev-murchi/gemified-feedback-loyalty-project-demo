import type { Logger } from '../../../../shared-kernel/logger.js';
import type { Result } from '../../../../shared-kernel/result.js';
import { OutageLog } from '../../../../platform/redis/outage-log.js';
import type { ChallengeStore } from '../../application/ports/challenge-store.js';
import type { TooManyChallenges } from '../../domain/challenge/challenge-errors.js';
import type { Challenge } from '../../domain/challenge/challenge.js';
import type { Nonce } from '../../domain/challenge/nonce.js';

export interface OutageLoggingChallengeStoreDeps {
  readonly inner: ChallengeStore;
  readonly logger: Logger;
}

/**
 * Lets a failing store fail (the endpoint answers 500: no challenge can be issued that could not
 * be verified later, so there is no fail-open here) and tells the log about the outage once: one
 * warning at the first failure, one info line when the store works again.
 */
export class OutageLoggingChallengeStore implements ChallengeStore {
  readonly #outage: OutageLog;

  constructor(private readonly deps: OutageLoggingChallengeStoreDeps) {
    this.#outage = new OutageLog({
      logger: deps.logger,
      down: 'Challenge store unavailable; challenges cannot be issued or used',
      up: 'Challenge store available again',
    });
  }

  save(challenge: Challenge): Promise<Result<void, TooManyChallenges>> {
    return this.#watched(() => this.deps.inner.save(challenge));
  }

  take(nonce: Nonce): Promise<Challenge | undefined> {
    return this.#watched(() => this.deps.inner.take(nonce));
  }

  async #watched<T>(call: () => Promise<T>): Promise<T> {
    try {
      const result = await call();
      this.#outage.recovered();
      return result;
    } catch (error) {
      this.#outage.failed(error);
      throw error;
    }
  }
}
