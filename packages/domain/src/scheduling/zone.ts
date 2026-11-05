import { instantFromDate } from '../core';
import type { Instant, LocalDate, TimeZoneId } from '../core';
import { fromParts } from './local-date';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: TimeZoneId): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function localDateOfMs(epochMs: number, timeZone: TimeZoneId): LocalDate {
  const parts = formatterFor(timeZone).formatToParts(new Date(epochMs));
  const pick = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return fromParts(pick('year'), pick('month'), pick('day'));
}

/** The calendar date it currently is, in the given zone, at the given instant. */
export const localDateOf = (instant: Instant, timeZone: TimeZoneId): LocalDate =>
  localDateOfMs(Date.parse(instant), timeZone);

const MINUTE = 60_000;
// UTC offsets span -12h..+14h, so a +/-27h window always brackets local midnight.
const SEARCH_RADIUS_MS = 27 * 60 * MINUTE;

/**
 * The first instant of a local calendar day. Found by search rather than
 * offset arithmetic so it stays correct when midnight is skipped (spring
 * forward at 00:00) or repeated (fall back).
 */
export function startOfDayInstant(date: LocalDate, timeZone: TimeZoneId): Instant {
  const base = Date.parse(`${date}T00:00:00Z`);
  let lo = Math.floor((base - SEARCH_RADIUS_MS) / MINUTE); // local date < `date`
  let hi = Math.ceil((base + SEARCH_RADIUS_MS) / MINUTE); // local date >= `date`
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDateOfMs(mid * MINUTE, timeZone) >= date) hi = mid;
    else lo = mid;
  }
  return instantFromDate(new Date(hi * MINUTE));
}
