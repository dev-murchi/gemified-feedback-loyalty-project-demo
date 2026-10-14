import { IdempotencyKey } from '../../../src/contexts/feedback/domain/idempotency-key.js';
import { RequestFingerprint } from '../../../src/contexts/feedback/domain/request-fingerprint.js';
import {
  RewardLimits,
  DEFAULT_REWARD_LIMITS,
} from '../../../src/contexts/feedback/domain/reward-cooldown/reward-limits.js';

describe('IdempotencyKey', () => {
  it('accepts a UUID and compares it in lower case', () => {
    const parsed = IdempotencyKey.parse('3F2504E0-4F89-41D3-9A0C-0305E82C3301');

    expect(parsed).toEqual({
      ok: true,
      value: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });
  });

  it.each([
    '',
    'not-a-uuid',
    '3f2504e0-4f89-41d3-9a0c-0305e82c330',
    ' 3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  ])('rejects %j as a validation error on the header', (raw) => {
    const parsed = IdempotencyKey.parse(raw);

    expect(parsed.ok ? undefined : parsed.error).toEqual({
      code: 'VALIDATION_ERROR',
      field: 'Idempotency-Key',
    });
  });
});

describe('RequestFingerprint', () => {
  it('accepts a lower-case SHA-256 hex and nothing else', () => {
    expect(RequestFingerprint.parse('a'.repeat(64)).ok).toBe(true);
    for (const raw of ['', 'A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64)])
      expect(RequestFingerprint.parse(raw).ok).toBe(false);
  });
});

describe('RewardLimits', () => {
  it('defaults to 24 hours between rewards and 3 attempts in 24 hours', () => {
    expect(DEFAULT_REWARD_LIMITS).toMatchObject({
      cooldownMs: 86_400_000,
      attemptWindowMs: 86_400_000,
      maxAttempts: 3,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'refuses %j as a limit (a wrong configuration stops start-up)',
    (bad) => {
      expect(() =>
        RewardLimits.create({
          cooldownMs: bad,
          attemptWindowMs: 1,
          maxAttempts: 1,
        }),
      ).toThrow();
      expect(() =>
        RewardLimits.create({
          cooldownMs: 1,
          attemptWindowMs: 1,
          maxAttempts: bad,
        }),
      ).toThrow();
    },
  );
});
