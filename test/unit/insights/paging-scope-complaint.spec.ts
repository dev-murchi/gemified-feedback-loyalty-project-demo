import { isComplaint } from '../../../src/contexts/insights/domain/complaint.js';
import { Cursor } from '../../../src/contexts/insights/domain/paging/cursor.js';
import { PageSize } from '../../../src/contexts/insights/domain/paging/page-size.js';
import { parseScopes } from '../../../src/contexts/insights/domain/scope.js';

describe('Cursor (FR-B2B-03)', () => {
  const position = {
    submittedAt: new Date('2026-10-12T09:14:05.000Z'),
    id: '8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  };

  it('round-trips a position through an opaque base64url text', () => {
    const cursor = Cursor.encode(position);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Cursor.decode(cursor)).toEqual({ ok: true, value: position });
  });

  it.each([
    '',
    'not-base64!',
    'eyJ4IjoxfQ',
    Cursor.encode(position).slice(0, 5),
  ])('rejects %j as VALIDATION_ERROR on cursor', (value) => {
    expect(Cursor.decode(value)).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', field: 'cursor' },
    });
  });

  it('orders newest first, the id breaking ties', () => {
    const later = {
      submittedAt: new Date('2026-10-12T10:00:00.000Z'),
      id: 'a',
    };
    const sameTimeSmallerId = {
      submittedAt: position.submittedAt,
      id: '00000000',
    };

    expect(Cursor.isAfter(sameTimeSmallerId, position)).toBe(true);
    expect(Cursor.isAfter(later, position)).toBe(false);
    expect(Cursor.isAfter(position, position)).toBe(false);
  });
});

describe('PageSize', () => {
  it('is 20 by default and 1–100 otherwise', () => {
    expect(PageSize.parse(undefined)).toEqual({ ok: true, value: 20 });
    expect(PageSize.parse(1)).toEqual({ ok: true, value: 1 });
    expect(PageSize.parse(100)).toEqual({ ok: true, value: 100 });
  });

  it.each([0, 101, 2.5, Number.NaN])('rejects %s', (limit) => {
    expect(PageSize.parse(limit)).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', field: 'limit' },
    });
  });
});

describe('parseScopes', () => {
  it('reads space-separated known scopes, once each', () => {
    expect(
      parseScopes('b2b.feedback.read  b2b.summary.read b2b.feedback.read'),
    ).toEqual(['b2b.feedback.read', 'b2b.summary.read']);
  });

  it('refuses a request with any unknown scope', () => {
    expect(parseScopes('b2b.feedback.read b2b.admin')).toBeUndefined();
  });

  it('gives no scopes for an empty or blank parameter (the token use case reads it as absent)', () => {
    expect(parseScopes('')).toEqual([]);
    expect(parseScopes('   ')).toEqual([]);
  });
});

describe('isComplaint (FR-B2B-04)', () => {
  it.each([
    ['valid', 'angry', true],
    ['valid', 'disappointed', true],
    ['valid', 'neutral', false],
    ['spam', 'angry', false],
    ['unanalyzed', null, false],
  ] as const)(
    '%s with %s is a complaint: %s',
    (status, sentiment, expected) => {
      expect(isComplaint(status, sentiment)).toBe(expected);
    },
  );
});
