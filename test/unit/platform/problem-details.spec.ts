import { problemFor } from '../../../src/platform/http/problem-details.js';
import { ProblemException } from '../../../src/platform/http/problem-exception.js';

describe('problemFor', () => {
  it('builds the fixed parts from the code and carries the request id', () => {
    // When a problem is built for a code
    const problem = problemFor('CHALLENGE_INVALID', 'req-1');

    // Then type, title and status follow the code, as in the contract example
    expect(problem).toEqual({
      type: 'https://errors.example.invalid/challenge-invalid',
      title: 'Nonce geçersiz, süresi dolmuş veya daha önce kullanılmış',
      status: 401,
      code: 'CHALLENGE_INVALID',
      requestId: 'req-1',
    });
  });

  it('adds retryAfterSeconds and field errors only when given', () => {
    const cooldown = problemFor('REWARD_COOLDOWN', 'r', {
      retryAfterSeconds: 3600,
    });
    const invalid = problemFor('VALIDATION_ERROR', 'r', {
      errors: [{ field: 'nonce', message: 'required' }],
    });

    expect(cooldown).toMatchObject({ status: 422, retryAfterSeconds: 3600 });
    expect(invalid).toMatchObject({
      status: 400,
      errors: [{ field: 'nonce', message: 'required' }],
    });
    expect(problemFor('NOT_FOUND', 'r')).not.toHaveProperty('errors');
  });

  it('has no user-facing message field', () => {
    expect(problemFor('INTERNAL_ERROR', 'r')).not.toHaveProperty('message');
  });
});

describe('ProblemException.from', () => {
  it('keeps the code of a domain error', () => {
    expect(ProblemException.from({ code: 'KEY_REVOKED' }).code).toBe(
      'KEY_REVOKED',
    );
  });

  it('names the field of a validation error', () => {
    const exception = ProblemException.from({
      code: 'VALIDATION_ERROR',
      field: 'keyId',
    } as { code: 'VALIDATION_ERROR' });

    expect(exception.extras.errors?.map((error) => error.field)).toEqual([
      'keyId',
    ]);
  });

  it('treats a code outside the API catalog as a programming error', () => {
    expect(() => ProblemException.from({ code: 'MADE_UP' })).toThrow();
  });
});
