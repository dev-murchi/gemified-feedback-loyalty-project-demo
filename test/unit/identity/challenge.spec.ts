import {
  Challenge,
  CHALLENGE_TTL_MS,
} from '../../../src/contexts/identity/domain/challenge/challenge.js';
import { Nonce } from '../../../src/contexts/identity/domain/challenge/nonce.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

const NOW = new Date('2026-10-12T09:15:00.000Z');

describe('Challenge', () => {
  it('is issued with a fresh nonce and expires 60 seconds later (docs/06 §4)', () => {
    // Given a random source
    const random = new SequentialRandomSource();

    // When a challenge is issued
    const challenge = Challenge.issue(random, NOW);

    // Then its nonce comes from the random source and it expires after 60 seconds
    expect(challenge.nonce).toBe(Nonce.generate(new SequentialRandomSource()));
    expect(CHALLENGE_TTL_MS).toBe(60_000);
    expect(challenge.expiresAt).toEqual(new Date('2026-10-12T09:16:00.000Z'));
  });

  it.each([
    ['at issue time', 0, true],
    ['one millisecond before expiry', CHALLENGE_TTL_MS - 1, true],
    ['exactly at expiry', CHALLENGE_TTL_MS, false],
    ['after expiry', CHALLENGE_TTL_MS + 1, false],
  ])('is live %s: %s', (_when, elapsed, live) => {
    // Given an issued challenge
    const challenge = Challenge.issue(new SequentialRandomSource(), NOW);

    // When time has passed
    const now = new Date(NOW.getTime() + elapsed);

    // Then it is live only before its expiry (TC-AUTH-03)
    expect(Challenge.isLiveAt(challenge, now)).toBe(live);
  });
});
