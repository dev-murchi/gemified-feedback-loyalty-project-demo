import {
  QR_TOKEN_BYTES,
  QrToken,
} from '../../../src/catalog/domain/branch/qr-token.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

/** Same pattern as FeedbackSubmission.qrToken in docs/api/openapi.yaml. */
const CONTRACT_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

const decode = (token: string): Uint8Array =>
  new Uint8Array(Buffer.from(token, 'base64url'));

describe('QrToken', () => {
  it('is generated from at least 128 bits of injected randomness (FR-QR-01)', () => {
    // Given a random source
    const random = new SequentialRandomSource();

    // When a token is generated
    const token = QrToken.generate(random);

    // Then it fits the API contract and carries exactly the bytes handed out, 16 or more
    expect(token).toMatch(CONTRACT_PATTERN);
    expect(decode(token)).toEqual(random.calls[0]);
    expect(decode(token).length).toBe(QR_TOKEN_BYTES);
    expect(QR_TOKEN_BYTES * 8).toBeGreaterThanOrEqual(128);
  });

  it('differs when the random bytes differ', () => {
    // Given a random source
    const random = new SequentialRandomSource();

    // When two tokens are generated
    const first = QrToken.generate(random);
    const second = QrToken.generate(random);

    // Then they differ
    expect(second).not.toBe(first);
  });

  it('accepts an existing well-formed token', () => {
    // Given a token that was generated earlier
    const token = QrToken.generate(new SequentialRandomSource());

    // When it is parsed
    const parsed = QrToken.parse(token);

    // Then it is accepted unchanged
    expect(parsed).toEqual({ ok: true, value: token });
  });

  it.each([
    '',
    'too-short',
    'contains spaces in the middle',
    'x'.repeat(65),
    'base64+with/padding==00',
  ])('rejects the malformed token %j with QR_INVALID (FR-QR-02)', (raw) => {
    // Given a malformed token
    // When it is parsed
    const parsed = QrToken.parse(raw);

    // Then it is rejected as QR_INVALID
    expect(parsed.ok ? undefined : parsed.error.code).toBe('QR_INVALID');
  });
});
