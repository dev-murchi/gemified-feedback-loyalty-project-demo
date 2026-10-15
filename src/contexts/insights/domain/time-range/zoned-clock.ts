// Time-zone arithmetic with the built-in Intl API only (no library, no import): the canonical name
// of a zone, how far it is ahead of UTC at an instant, the first instant of a local day, and ISO
// text with the zone's offset.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

/**
 * The runtime's own name for an IANA zone, or undefined if it does not know it. Intl accepts
 * `europe/istanbul` and aliases such as `Turkey`; responses echo the canonical name.
 */
export function canonicalTimeZone(timeZone: string): string | undefined {
  try {
    return formatterFor(timeZone).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: parts['year'] ?? 0,
    month: parts['month'] ?? 0,
    day: parts['day'] ?? 0,
    hour: parts['hour'] ?? 0,
    minute: parts['minute'] ?? 0,
    second: parts['second'] ?? 0,
  };
}

/** Milliseconds the zone's wall clock is ahead of UTC at this instant (Istanbul: +3 h). */
export function offsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const pad = (value: number, width = 2): string =>
  String(Math.abs(value)).padStart(width, '0');

/** The calendar day of the instant in the zone, `YYYY-MM-DD`. */
export function localDate(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * The first instant of that calendar day in the zone: its 00:00, or, where the clock jumps forward
 * at midnight and 00:00 does not exist, the time the day really starts (e.g. 01:00). The guess
 * from the offset at UTC midnight is corrected once with the offset at the guess; of the two, the
 * earliest that falls on the requested day wins.
 */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const wall = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const first = wall - offsetMs(new Date(wall), timeZone);
  const corrected = wall - offsetMs(new Date(first), timeZone);
  const onTheDay = [first, corrected].filter(
    (instant) => localDate(new Date(instant), timeZone) === date,
  );
  return new Date(onTheDay.length > 0 ? Math.min(...onTheDay) : corrected);
}

/** `2026-10-01T00:00:00+03:00`: the instant as the zone's wall-clock time with its offset. */
export function toZonedIso(instant: Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  const offsetMinutes = Math.round(offsetMs(instant, timeZone) / 60_000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const offset = `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${offset}`;
}
