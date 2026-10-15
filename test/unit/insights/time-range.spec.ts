import {
  TimeRange,
  type TimeRangeQuery,
} from '../../../src/contexts/insights/domain/time-range/time-range.js';

const NOW = new Date('2026-10-16T09:00:00.000Z');

const rangeOf = (query: TimeRangeQuery) => {
  const result = TimeRange.parse(query, NOW);
  if (!result.ok) throw new Error(`range was rejected: ${result.error.field}`);
  return result.value;
};

const errorOf = (query: TimeRangeQuery) => {
  const result = TimeRange.parse(query, NOW);
  return result.ok ? undefined : result.error;
};

describe('TimeRange (FR-B2B-10)', () => {
  it('reads a plain date as the start of that day in Istanbul by default', () => {
    const range = rangeOf({ from: '2026-10-01', to: '2026-10-12' });

    expect(range.from).toEqual(new Date('2026-09-30T21:00:00.000Z'));
    expect(range.to).toEqual(new Date('2026-10-11T21:00:00.000Z'));
    expect(range.timeZone).toBe('Europe/Istanbul');
  });

  it('counts a comment at 23:30 Istanbul time in the Istanbul day, not the UTC one (TC-B2B-07)', () => {
    // 2026-10-05 23:30 Istanbul is 20:30 UTC; 2026-10-06 00:30 Istanbul is 21:30 UTC on the 5th
    const day = rangeOf({ from: '2026-10-05', to: '2026-10-06' });

    expect(day.contains(new Date('2026-10-05T20:30:00.000Z'))).toBe(true);
    expect(day.contains(new Date('2026-10-05T21:30:00.000Z'))).toBe(false);
    expect(day.contains(new Date('2026-10-04T21:00:00.000Z'))).toBe(true);
  });

  it('takes a date-time with Z or an offset as is (TC-API-04)', () => {
    const range = rangeOf({
      from: '2026-10-01T00:00:00+03:00',
      to: '2026-10-12T00:00:00Z',
    });

    expect(range.from).toEqual(new Date('2026-09-30T21:00:00.000Z'));
    expect(range.to).toEqual(new Date('2026-10-12T00:00:00.000Z'));
  });

  it('includes from and excludes to', () => {
    const range = rangeOf({
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-02T00:00:00Z',
    });

    expect(range.contains(new Date('2026-10-01T00:00:00.000Z'))).toBe(true);
    expect(range.contains(new Date('2026-10-02T00:00:00.000Z'))).toBe(false);
  });

  it('defaults to the 30 days up to now', () => {
    const range = rangeOf({});

    expect(range.to).toEqual(NOW);
    expect(range.from).toEqual(new Date('2026-09-16T09:00:00.000Z'));
  });

  it('starts 30 days before a given end when from is missing', () => {
    expect(rangeOf({ to: '2026-10-11T00:00:00Z' }).from).toEqual(
      new Date('2026-09-11T00:00:00.000Z'),
    );
  });

  it('uses another IANA zone for plain dates when asked', () => {
    expect(rangeOf({ from: '2026-10-01', timeZone: 'UTC' }).from).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
  });

  it.each(['europe/istanbul', 'Turkey', 'Asia/Istanbul'])(
    'echoes the canonical zone name for %s',
    (timeZone) => {
      const range = rangeOf({ from: '2026-10-01', to: '2026-10-02', timeZone });

      expect(range.timeZone).toBe('Europe/Istanbul');
      expect(range.from).toEqual(new Date('2026-09-30T21:00:00.000Z'));
    },
  );

  it('shows the ends as wall-clock time with the zone’s offset, as the responses do', () => {
    const range = rangeOf({ from: '2026-10-01', to: '2026-10-12' });

    expect(range.fromIso).toBe('2026-10-01T00:00:00+03:00');
    expect(range.toIso).toBe('2026-10-12T00:00:00+03:00');
  });

  it('formats a negative, non-whole-hour offset', () => {
    const range = rangeOf({
      from: '2026-10-01',
      to: '2026-10-02',
      timeZone: 'America/St_Johns',
    });

    expect(range.fromIso).toBe('2026-10-01T00:00:00-02:30');
  });

  it.each([
    // Berlin leaves summer time on 2026-10-25: that day starts at UTC+2, the next at UTC+1
    ['Europe/Berlin', '2026-10-25', '2026-10-24T22:00:00.000Z'],
    ['Europe/Berlin', '2026-10-26', '2026-10-25T23:00:00.000Z'],
    // Santiago leaves summer time at midnight: the day starts at 00:00 UTC-4, after the 23:00 repeat
    ['America/Santiago', '2026-04-05', '2026-04-05T04:00:00.000Z'],
    // Santiago and Havana jump forward at midnight: 00:00 does not exist, the day starts at 01:00
    ['America/Santiago', '2026-09-06', '2026-09-06T04:00:00.000Z'],
    ['America/Havana', '2026-03-08', '2026-03-08T05:00:00.000Z'],
    // Beirut jumps forward at midnight too, ahead of UTC
    ['Asia/Beirut', '2026-03-29', '2026-03-28T22:00:00.000Z'],
  ])(
    'starts the day %s %s at its first real instant, %s',
    (timeZone, date, expected) => {
      expect(rangeOf({ from: date, to: '2027-01-01', timeZone }).from).toEqual(
        new Date(expected),
      );
    },
  );

  it('accepts the last second of a leap day', () => {
    expect(
      rangeOf({ from: '2028-02-29T23:59:59Z', to: '2028-03-02' }).from,
    ).toEqual(new Date('2028-02-29T23:59:59.000Z'));
  });

  describe('400 VALIDATION_ERROR (TC-API-04)', () => {
    it.each<[TimeRangeQuery, string]>([
      [{ from: '01.10.2026' }, 'from'],
      [{ from: '2026-10-01T00:00' }, 'from'],
      [{ from: '2026-02-30' }, 'from'],
      [{ from: '2026-02-30T00:00:00Z' }, 'from'],
      [{ from: '2026-10-01T24:00:00Z' }, 'from'],
      [{ from: '2026-10-01T10:60:00Z' }, 'from'],
      [{ to: 'yesterday' }, 'to'],
      [{ to: '2026-10-01T10:00:60+03:00' }, 'to'],
      [{ to: '2026-10-01T10:00:00+03:60' }, 'to'],
      [{ to: '2026-13-01T10:00:00Z' }, 'to'],
      [{ timeZone: 'Mars/Olympus' }, 'timeZone'],
      [{ from: '2026-10-12', to: '2026-10-01' }, 'from'],
      [{ from: '2026-10-01', to: '2026-10-01' }, 'from'],
      // Samoa skipped 2011-12-30 entirely
      [
        { from: '2011-12-30', to: '2012-01-02', timeZone: 'Pacific/Apia' },
        'from',
      ],
    ])('rejects %j on %s', (query, field) => {
      expect(errorOf(query)).toEqual({ code: 'VALIDATION_ERROR', field });
    });
  });
});
