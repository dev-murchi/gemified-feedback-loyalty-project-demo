import type { DomainError } from '../../../../shared-kernel/domain-error.js';
import { err, ok, type Result } from '../../../../shared-kernel/result.js';
import {
  canonicalTimeZone,
  localDate,
  startOfLocalDay,
  toZonedIso,
} from './zoned-clock.js';

export const DEFAULT_TIME_ZONE = 'Europe/Istanbul';
const DEFAULT_SPAN_MS = 30 * 24 * 60 * 60 * 1000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The contract's pattern: a date, or a date-time that always carries `Z` or an offset. */
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/;

/** Upper bounds (exclusive) of the hour, minute, second and offset groups of DATE_TIME. */
const TIME_LIMITS: readonly [number, number][] = [
  [4, 24],
  [5, 60],
  [6, 60],
  [8, 24],
  [9, 60],
];

export interface InvalidTimeRange extends DomainError<'VALIDATION_ERROR'> {
  readonly field: 'from' | 'to' | 'timeZone';
}

/** The query parameters as received; undefined when absent. */
export interface TimeRangeQuery {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly timeZone?: string | undefined;
}

const invalid = (field: InvalidTimeRange['field']): InvalidTimeRange => ({
  code: 'VALIDATION_ERROR',
  field,
});

/** A calendar day that exists: `Date.UTC` rolls 2026-02-30 over to March, so compare back. */
const isRealDay = (year: number, month: number, day: number): boolean => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * Every field written in a date-time must exist as written: `new Date` silently turns
 * 2026-02-30T00:00Z into March 2 and T24:00 into the next day, which would widen a range unseen.
 */
function isRealDateTime(match: RegExpExecArray): boolean {
  const field = (group: number): number => Number(match[group] ?? 0);
  return (
    isRealDay(field(1), field(2), field(3)) &&
    TIME_LIMITS.every(([group, limit]) => field(group) < limit)
  );
}

/** A date means the first instant of that day in the zone; a date-time is taken as is. */
function instantOf(value: string, timeZone: string): Date | undefined {
  if (DATE.test(value)) {
    const day = startOfLocalDay(value, timeZone);
    return localDate(day, timeZone) === value ? day : undefined;
  }
  const match = DATE_TIME.exec(value);
  if (match === null || !isRealDateTime(match)) return undefined;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? undefined : instant;
}

/** Parses one end; absent stays undefined, malformed is an error for that field. */
function endOf(
  value: string | undefined,
  field: 'from' | 'to',
  timeZone: string,
): Result<Date | undefined, InvalidTimeRange> {
  if (value === undefined) return ok(undefined);
  const instant = instantOf(value, timeZone);
  return instant === undefined ? err(invalid(field)) : ok(instant);
}

/**
 * The reporting window of a B2B query (FR-B2B-10, docs/api/openapi.yaml `from`, `to`, `timeZone`):
 * from (inclusive) to (exclusive), interpreted in an IANA zone, Europe/Istanbul by default. Data is
 * stored in UTC; a plain date means the start of that day in the zone, so a comment at 23:30 in
 * Istanbul belongs to the Istanbul day (TC-B2B-07). Without `to` it ends now; without `from` it
 * starts 30 days before its end. No maximum length in the demo (owner decision of S0-09).
 */
export class TimeRange {
  private constructor(
    readonly from: Date,
    readonly to: Date,
    readonly timeZone: string,
  ) {}

  static parse(
    query: TimeRangeQuery,
    now: Date,
  ): Result<TimeRange, InvalidTimeRange> {
    const timeZone = canonicalTimeZone(query.timeZone ?? DEFAULT_TIME_ZONE);
    if (timeZone === undefined) return err(invalid('timeZone'));
    const from = endOf(query.from, 'from', timeZone);
    if (!from.ok) return from;
    const to = endOf(query.to, 'to', timeZone);
    if (!to.ok) return to;
    const end = to.value ?? now;
    const start = from.value ?? new Date(end.getTime() - DEFAULT_SPAN_MS);
    return start.getTime() < end.getTime()
      ? ok(new TimeRange(new Date(start), new Date(end), timeZone))
      : err(invalid('from'));
  }

  contains(instant: Date): boolean {
    const time = instant.getTime();
    return time >= this.from.getTime() && time < this.to.getTime();
  }

  /** `from` as the zone's wall-clock time with its offset, as the responses show it. */
  get fromIso(): string {
    return toZonedIso(this.from, this.timeZone);
  }

  get toIso(): string {
    return toZonedIso(this.to, this.timeZone);
  }
}
