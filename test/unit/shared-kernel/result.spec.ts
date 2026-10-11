import {
  andThen,
  err,
  map,
  ok,
  type Result,
} from '../../../src/shared-kernel/result.js';

const half = (n: number): Result<number, 'ODD'> =>
  n % 2 === 0 ? ok(n / 2) : err('ODD');

describe('Result', () => {
  it('map transforms the value of a success', () => {
    // Given a success
    const result = ok(2);

    // When it is mapped
    const mapped = map(result, (n) => n * 10);

    // Then the value is transformed
    expect(mapped).toEqual(ok(20));
  });

  it('map passes an error through unchanged', () => {
    // Given an error
    const result = half(3);

    // When it is mapped
    const mapped = map(result, (n) => n * 10);

    // Then the error is kept
    expect(mapped).toEqual(err('ODD'));
  });

  it('andThen chains steps while they succeed', () => {
    // Given a value that can be halved twice
    // When two halving steps are chained
    const result = andThen(half(8), half);

    // Then both steps ran
    expect(result).toEqual(ok(2));
  });

  it('andThen stops at the first error', () => {
    // Given a step that fails
    let secondStepRan = false;

    // When a second step is chained after it
    const result = andThen(half(3), (n) => {
      secondStepRan = true;
      return ok(n);
    });

    // Then the error is returned and the second step never runs
    expect(result).toEqual(err('ODD'));
    expect(secondStepRan).toBe(false);
  });
});
