import type { DomainError } from '../../../shared-kernel/domain-error.js';
import type { Branded } from '../../../shared-kernel/ids.js';
import type { RandomSource } from '../../../shared-kernel/random-source.js';
import { err, ok, type Result } from '../../../shared-kernel/result.js';

/** The unguessable token inside a branch QR code (FR-QR-01, ADR-010). */
export type QrToken = Branded<string, 'QrToken'>;

/** Unknown, revoked or malformed QR token (FR-QR-02); API code QR_INVALID. */
export type QrInvalid = DomainError<'QR_INVALID'>;

/** FR-QR-01: at least 128 bits of randomness. */
export const QR_TOKEN_BYTES = 16;

/** Same pattern as `FeedbackSubmission.qrToken` in docs/api/openapi.yaml. */
const FORMAT = /^[A-Za-z0-9_-]{22,64}$/;

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

export const QrToken = {
  /** The only way to make up a token: random bytes from the injected source. */
  generate(random: RandomSource): QrToken {
    return toBase64Url(random.bytes(QR_TOKEN_BYTES)) as QrToken;
  },

  /**
   * Accepts an existing token (from a request or from storage) after a format check. It cannot
   * issue a QR code: `Branch.issueQrCode` always generates a new token.
   */
  parse(raw: string): Result<QrToken, QrInvalid> {
    return FORMAT.test(raw) ? ok(raw as QrToken) : err({ code: 'QR_INVALID' });
  },
};
