import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import type { Branded } from '../../../../shared-kernel/ids.js';
import type { RandomSource } from '../../../../shared-kernel/random-source.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';

/** The one-time value a device signs to register or open a session (docs/06 §4, SDD 7.1). */
export type Nonce = Branded<string, 'Nonce'>;

/** Unknown, used, expired or malformed nonce (FR-AUTH-03); API code CHALLENGE_INVALID. */
export type ChallengeInvalid = DomainError<'CHALLENGE_INVALID'>;

/** SDD 7.1: 32 random bytes. */
export const NONCE_BYTES = 32;

/** Same pattern as `Challenge.nonce` in docs/api/openapi.yaml: 32 bytes, base64url, 43 characters. */
const FORMAT = /^[A-Za-z0-9_-]{43}$/;

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

export const Nonce = {
  /** The only way to make up a nonce: random bytes from the injected source. */
  generate(random: RandomSource): Nonce {
    return toBase64Url(random.bytes(NONCE_BYTES)) as Nonce;
  },

  /**
   * Accepts a nonce sent back by a device after a format check. A malformed nonce cannot have been
   * issued, so it is reported like an unknown one.
   */
  parse(raw: string): Result<Nonce, ChallengeInvalid> {
    return FORMAT.test(raw)
      ? ok(raw as Nonce)
      : err({ code: 'CHALLENGE_INVALID' });
  },
};
