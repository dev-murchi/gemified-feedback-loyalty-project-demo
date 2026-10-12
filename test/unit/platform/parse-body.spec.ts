import { z } from 'zod';
import { parseBody } from '../../../src/platform/http/parse-body.js';
import { ProblemException } from '../../../src/platform/http/problem-exception.js';

const schema = z
  .object({
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    platform: z.enum(['ios', 'android']),
    chain: z.array(z.string()).min(2).optional(),
    nested: z.object({ count: z.number().int() }).optional(),
  })
  .strict();

const valid = { nonce: 'A'.repeat(43), platform: 'ios' };

/** What the request would answer: the code and the fields named in `errors`. */
const failureOf = (input: unknown) => {
  try {
    parseBody(schema, input);
  } catch (error) {
    if (error instanceof ProblemException)
      return {
        code: error.code,
        fields: error.extras.errors?.map((entry) => entry.field),
      };
    throw error;
  }
  return undefined;
};

describe('parseBody', () => {
  it('returns the parsed value when the body fits the schema', () => {
    expect(parseBody(schema, valid)).toEqual(valid);
  });

  it('names the missing and the wrongly typed fields in VALIDATION_ERROR', () => {
    expect(failureOf({ platform: 'windows' })).toEqual({
      code: 'VALIDATION_ERROR',
      fields: ['nonce', 'platform'],
    });
  });

  it('names each unexpected field, because the contract forbids additional properties', () => {
    expect(failureOf({ ...valid, extra: 1, other: 2 })).toEqual({
      code: 'VALIDATION_ERROR',
      fields: ['extra', 'other'],
    });
  });

  it('uses a dotted path for nested fields and array positions', () => {
    expect(
      failureOf({ ...valid, nested: { count: 1.5 }, chain: ['a'] }),
    ).toEqual({
      code: 'VALIDATION_ERROR',
      fields: ['chain', 'nested.count'],
    });
  });

  it.each([null, 'text', 42, [], undefined])(
    'reports a body that is not an object (%j) against the whole body',
    (input) => {
      expect(failureOf(input)).toEqual({
        code: 'VALIDATION_ERROR',
        fields: ['body'],
      });
    },
  );

  it('only reports the format; it throws nothing but ProblemException', () => {
    expect(() => parseBody(schema, null)).toThrow(ProblemException);
  });
});
