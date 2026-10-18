import { OutageLoggingChallengeStore } from '../../../src/contexts/identity/adapters/outbound/outage-logging-challenge.store.js';
import type { ChallengeStore } from '../../../src/contexts/identity/application/ports/challenge-store.js';
import { Challenge } from '../../../src/contexts/identity/domain/challenge/challenge.js';
import { ok } from '../../../src/shared-kernel/result.js';
import { FakeClock } from '../../support/fake-clock.js';
import { RecordingLogger } from '../../support/recording-logger.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

/** A store that fails while `down` is true and otherwise forgets everything. */
const switchable = () => {
  const state = { down: false };
  const store: ChallengeStore = {
    save: () =>
      state.down
        ? Promise.reject(new Error('Stream isn’t writeable'))
        : Promise.resolve(ok(undefined)),
    take: () =>
      state.down
        ? Promise.reject(new Error('Stream isn’t writeable'))
        : Promise.resolve(undefined),
  };
  return { state, store };
};

const challenge = () =>
  Challenge.issue(new SequentialRandomSource(), new FakeClock().now());

describe('OutageLoggingChallengeStore', () => {
  it('lets a failure through, so the endpoint can answer 500 instead of issuing a nonce it cannot verify', async () => {
    const { state, store } = switchable();
    state.down = true;
    const watched = new OutageLoggingChallengeStore({
      inner: store,
      logger: new RecordingLogger(),
    });

    await expect(watched.save(challenge())).rejects.toThrow('writeable');
    await expect(watched.take(challenge().nonce)).rejects.toThrow('writeable');
  });

  it('logs one warning for many failures of save and take, and one info line on recovery', async () => {
    const { state, store } = switchable();
    const logger = new RecordingLogger();
    const watched = new OutageLoggingChallengeStore({ inner: store, logger });
    state.down = true;
    for (let i = 0; i < 4; i += 1) {
      await watched.save(challenge()).catch(() => undefined);
      await watched.take(challenge().nonce).catch(() => undefined);
    }

    state.down = false;
    await watched.save(challenge());
    await watched.take(challenge().nonce);

    expect(logger.warnings).toHaveLength(1);
    expect(logger.infos.map((line) => line.message)).toEqual([
      'Challenge store available again',
    ]);
  });

  it('passes answers through while the store works', async () => {
    const { store } = switchable();
    const logger = new RecordingLogger();
    const watched = new OutageLoggingChallengeStore({ inner: store, logger });

    expect((await watched.save(challenge())).ok).toBe(true);
    expect(await watched.take(challenge().nonce)).toBeUndefined();
    expect(logger.warnings).toEqual([]);
  });
});
