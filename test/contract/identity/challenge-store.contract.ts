import { Challenge } from '../../../src/contexts/identity/domain/challenge/challenge.js';
import { Nonce } from '../../../src/contexts/identity/domain/challenge/nonce.js';
import type { ChallengeStoreHarness } from '../../support/memory-identity.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

export function challengeStoreContract(
  makeHarness: () => Promise<ChallengeStoreHarness>,
): void {
  let harness: ChallengeStoreHarness;
  const random = new SequentialRandomSource();
  const issue = () => Challenge.issue(random, harness.clock.now());

  beforeEach(async () => {
    harness = await makeHarness();
  });

  afterEach(() => harness.dispose());

  it('gives a saved challenge back exactly once (single use, T-S4)', async () => {
    // Given a saved challenge
    const challenge = issue();
    await harness.store.save(challenge);

    // When its nonce is taken twice
    const first = await harness.store.take(challenge.nonce);
    const second = await harness.store.take(challenge.nonce);

    // Then only the first take gets it
    expect(first).toEqual(challenge);
    expect(second).toBeUndefined();
  });

  it('gives a challenge to only one of two simultaneous takes', async () => {
    // Given a saved challenge
    const challenge = issue();
    await harness.store.save(challenge);

    // When two requests take it at the same time
    const takes = await Promise.all([
      harness.store.take(challenge.nonce),
      harness.store.take(challenge.nonce),
    ]);

    // Then exactly one of them gets it
    expect(takes.filter((taken) => taken !== undefined)).toHaveLength(1);
  });

  it('knows nothing of a nonce it never saved', async () => {
    // Given a nonce that was issued but never saved
    const nonce = Nonce.generate(random);

    // When it is taken
    // Then nothing is found
    expect(await harness.store.take(nonce)).toBeUndefined();
  });

  it('never hands out an expired challenge as a live one', async () => {
    // Given a saved challenge whose time has passed
    const challenge = issue();
    await harness.store.save(challenge);
    harness.clock.set(challenge.expiresAt);

    // When it is taken
    const taken = await harness.store.take(challenge.nonce);

    // Then it is either forgotten or still expired; it never becomes live
    const live =
      taken !== undefined && Challenge.isLiveAt(taken, harness.clock.now());
    expect(live).toBe(false);
  });

  it('keeps the other challenges when one is taken', async () => {
    // Given two saved challenges
    const first = issue();
    const second = issue();
    await harness.store.save(first);
    await harness.store.save(second);

    // When the first is taken
    await harness.store.take(first.nonce);

    // Then the second is still there
    expect(await harness.store.take(second.nonce)).toEqual(second);
  });
}
