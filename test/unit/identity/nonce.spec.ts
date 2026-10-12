import {
  Nonce,
  NONCE_BYTES,
} from '../../../src/contexts/identity/domain/challenge/nonce.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

/** Same pattern as Challenge.nonce in docs/api/openapi.yaml. */
const CONTRACT_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const decode = (nonce: string): Uint8Array =>
  new Uint8Array(Buffer.from(nonce, 'base64url'));

describe('Nonce', () => {
  it('is generated from 32 bytes of injected randomness (SDD 7.1)', () => {
    // Given a random source
    const random = new SequentialRandomSource();

    // When a nonce is generated
    const nonce = Nonce.generate(random);

    // Then it fits the API contract and carries exactly the 32 bytes handed out
    expect(nonce).toMatch(CONTRACT_PATTERN);
    expect(NONCE_BYTES).toBe(32);
    expect(decode(nonce)).toEqual(random.calls[0]);
  });

  it('differs when the random bytes differ', () => {
    // Given a random source
    const random = new SequentialRandomSource();

    // When two nonces are generated
    // Then they differ
    expect(Nonce.generate(random)).not.toBe(Nonce.generate(random));
  });

  it('accepts a nonce sent back unchanged', () => {
    // Given a generated nonce
    const nonce = Nonce.generate(new SequentialRandomSource());

    // When it is parsed
    // Then it is accepted unchanged
    expect(Nonce.parse(nonce)).toEqual({ ok: true, value: nonce });
  });

  it.each([
    '',
    'x'.repeat(42),
    'x'.repeat(44),
    `${'x'.repeat(42)}=`,
    `${'x'.repeat(42)}+`,
  ])('rejects the malformed nonce %j with CHALLENGE_INVALID', (raw) => {
    // Given a malformed nonce
    // When it is parsed
    const parsed = Nonce.parse(raw);

    // Then it is rejected like an unknown one
    expect(parsed.ok ? undefined : parsed.error.code).toBe('CHALLENGE_INVALID');
  });
});
