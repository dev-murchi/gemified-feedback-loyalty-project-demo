import type { Request, Response } from 'express';
import {
  requestIdMiddleware,
  requestIdOf,
} from '../../../src/platform/http/request-id.js';
import { SequentialIdGenerator } from '../../support/sequential-id-generator.js';

const run = (supplied: string | undefined) => {
  const headers: Record<string, string> = {};
  const response = {
    locals: {} as Record<string, unknown>,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response;
  const request = { header: () => supplied } as unknown as Request;
  let called = false;
  requestIdMiddleware(new SequentialIdGenerator())(request, response, () => {
    called = true;
  });
  return { id: requestIdOf(response), headers, called };
};

describe('requestIdMiddleware', () => {
  it('keeps a plain id the caller sent and echoes it in the response header', () => {
    const { id, headers, called } = run('client-id_1.2');
    expect([id, headers['X-Request-Id'], called]).toEqual([
      'client-id_1.2',
      'client-id_1.2',
      true,
    ]);
  });

  it('makes a new id when there is none', () => {
    expect(run(undefined).id).toBe('00000000-0000-4000-8000-000000000001');
  });

  it.each(['', 'has space', 'a'.repeat(65), 'new\nline', '<script>'])(
    'replaces the unacceptable id %j',
    (supplied) => {
      expect(run(supplied).id).toBe('00000000-0000-4000-8000-000000000001');
    },
  );
});
