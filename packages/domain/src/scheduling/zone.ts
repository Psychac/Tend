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

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock reading in the zone, as minutes since 1970 as if the wall clock were UTC. */
function wallMinutes(epochMinute: number, timeZone: TimeZoneId): number {
  let f = timeFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    timeFormatters.set(timeZone, f);
  }
  const parts = f.formatToParts(new Date(epochMinute * MINUTE));
  const pick = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return (
    Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour'), pick('minute')) / MINUTE
  );
}

/** "HH:MM" on the wall clock in the given zone at the given instant. */
export function localTimeOf(instant: Instant, timeZone: TimeZoneId): string {
  const minutes = wallMinutes(Math.floor(Date.parse(instant) / MINUTE), timeZone);
  const ofDay = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(ofDay / 60)).padStart(2, '0')}:${String(ofDay % 60).padStart(2, '0')}`;
}

/**
 * The instant at which the wall clock in `timeZone` first reads `date` at `time` ("HH:MM").
 * A time that does not exist (skipped by spring-forward) resolves to the first moment after
 * the gap; a time that happens twice (fall-back) resolves to one of the two.
 */
export function instantFromLocal(date: LocalDate, time: string, timeZone: TimeZoneId): Instant {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const target = Date.parse(`${date}T00:00:00Z`) / MINUTE + h * 60 + m;
  const center = Date.parse(`${date}T00:00:00Z`) / MINUTE;
  let lo = center - 27 * 60; // wall clock reads earlier than the target
  let hi = center + 27 * 60 + 1440; // wall clock reads at or after the target
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (wallMinutes(mid, timeZone) >= target) hi = mid;
    else lo = mid;
  }
  return instantFromDate(new Date(hi * MINUTE));
}
