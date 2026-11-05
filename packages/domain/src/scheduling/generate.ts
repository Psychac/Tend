import type { LocalDate } from '../core';
import type { Schedule, ScheduleStrategy } from '../entities/schedule';
import {
  addDays,
  addInterval,
  addMonths,
  addUnits,
  addYears,
  daysInMonth,
  fromParts,
  isoWeekday,
  maxDate,
  startOfIsoWeek,
  toParts,
} from './local-date';

export const DEFAULT_HORIZON_DAYS = 30;
export const DEFAULT_MAX_OCCURRENCES = 50;
/** Absolute ceiling: generation never returns more than this, whatever the caller asks. */
export const HARD_MAX_OCCURRENCES = 366;
/** Guards against runaway loops when a schedule started far in the past. */
const MAX_ITERATIONS = 100_000;

export interface UsageReading {
  readonly lastServiceReading: number;
  readonly currentReading: number;
}

export interface GenerationContext {
  /** The current date in the schedule's timezone. */
  readonly today: LocalDate;
  readonly horizonDays?: number | undefined;
  readonly maxOccurrences?: number | undefined;
  /** Due dates that already have an occurrence (any status); makes generation idempotent. */
  readonly existingDueDates: readonly LocalDate[];
  /**
   * For completion-interval schedules: the date of the last completion, or of
   * the last skip if the user skipped (so a skip restarts the interval).
   */
  readonly lastResolvedOn?: LocalDate | undefined;
  /** For usage schedules. */
  readonly usage?: UsageReading | undefined;
}

type Strategy<K extends ScheduleStrategy['kind']> = Extract<ScheduleStrategy, { kind: K }>;

/**
 * Due dates that should exist but do not yet.
 *
 * Pure, deterministic, bounded and idempotent: feeding the result back as
 * `existingDueDates` yields nothing new. Past dates are never back-filled;
 * the window starts today. Gaps from a long absence are handled separately by
 * `consolidateMissed` rather than by creating one occurrence per missed day.
 *
 * `condition` and `event` strategies are triggered by measurements and events
 * rather than dates, so they yield nothing here.
 */
export function missingDueDates(schedule: Schedule, ctx: GenerationContext): LocalDate[] {
  if (schedule.pausedAt !== undefined) return [];
  const limit = Math.min(ctx.maxOccurrences ?? DEFAULT_MAX_OCCURRENCES, HARD_MAX_OCCURRENCES);
  if (limit <= 0) return [];

  const existing = new Set<LocalDate>(ctx.existingDueDates);
  return candidateDates(schedule, ctx)
    .filter((d) => !existing.has(d) && (schedule.endsOn === undefined || d <= schedule.endsOn))
    .slice(0, limit);
}

function candidateDates(schedule: Schedule, ctx: GenerationContext): LocalDate[] {
  const s = schedule.strategy;
  switch (s.kind) {
    case 'calendar':
      return datesInWindow(calendarSequence(s, schedule.startsOn), schedule, ctx);
    case 'fixed_interval':
      return datesInWindow(fixedSequence(s), schedule, ctx);
    case 'completion_interval':
      return [completionIntervalDue(s, schedule.startsOn, ctx.lastResolvedOn)];
    case 'usage':
      return ctx.usage && isUsageDue(s, ctx.usage) ? [ctx.today] : [];
    case 'condition':
    case 'event':
      return [];
  }
}

function datesInWindow(
  sequence: Generator<LocalDate>,
  schedule: Schedule,
  ctx: GenerationContext,
): LocalDate[] {
  const from = maxDate(ctx.today, schedule.startsOn);
  const to = addDays(ctx.today, ctx.horizonDays ?? DEFAULT_HORIZON_DAYS);
  const out: LocalDate[] = [];
  let iterations = 0;
  for (const d of sequence) {
    if (d > to || ++iterations > MAX_ITERATIONS) break;
    if (d >= from) out.push(d);
  }
  return out;
}

function calendarSequence(s: Strategy<'calendar'>, startsOn: LocalDate): Generator<LocalDate> {
  switch (s.interval.unit) {
    case 'day':
      return dailySequence(s.interval.every, startsOn);
    case 'week':
      return weeklySequence(s.interval.every, s.byWeekday ?? [isoWeekday(startsOn)], startsOn);
    case 'month':
      return monthlySequence(s.interval.every, s.byMonthDay, startsOn);
    case 'year':
      return yearlySequence(s.interval.every, startsOn);
  }
}

function* dailySequence(every: number, startsOn: LocalDate): Generator<LocalDate> {
  for (let k = 0; ; k++) yield addDays(startsOn, k * every);
}

function* weeklySequence(
  every: number,
  byWeekday: readonly number[],
  startsOn: LocalDate,
): Generator<LocalDate> {
  const weekdays = [...new Set(byWeekday)].sort((a, b) => a - b);
  const weekStart = startOfIsoWeek(startsOn);
  for (let w = 0; ; w++) {
    const base = addDays(weekStart, 7 * every * w);
    for (const wd of weekdays) {
      const d = addDays(base, wd - 1);
      if (d >= startsOn) yield d;
    }
  }
}

/** A day-of-month beyond the month's length clamps to its last day (31st -> Feb 28). */
function* monthlySequence(
  every: number,
  byMonthDay: number | undefined,
  startsOn: LocalDate,
): Generator<LocalDate> {
  const first = toParts(startsOn);
  const day = byMonthDay ?? first.day;
  const firstOfMonth = fromParts(first.year, first.month, 1);
  for (let k = 0; ; k++) {
    const { year, month } = toParts(addMonths(firstOfMonth, k * every));
    const d = fromParts(year, month, Math.min(day, daysInMonth(year, month)));
    if (d >= startsOn) yield d;
  }
}

function* yearlySequence(every: number, startsOn: LocalDate): Generator<LocalDate> {
  for (let k = 0; ; k++) yield addYears(startsOn, k * every);
}

/** Always computed from the anchor, never from the previous date, so month-end clamping cannot drift. */
function* fixedSequence(s: Strategy<'fixed_interval'>): Generator<LocalDate> {
  for (let k = 0; ; k++) yield addInterval(s.anchor, s.interval, k);
}

function completionIntervalDue(
  s: Strategy<'completion_interval'>,
  startsOn: LocalDate,
  lastResolvedOn: LocalDate | undefined,
): LocalDate {
  return lastResolvedOn === undefined
    ? startsOn
    : addUnits(lastResolvedOn, s.interval.every, s.interval.unit);
}

/** The meter reading at which the next usage-based occurrence falls due. */
export const nextUsageThreshold = (s: Strategy<'usage'>, lastServiceReading: number): number =>
  lastServiceReading + s.every.value;

export const isUsageDue = (s: Strategy<'usage'>, usage: UsageReading): boolean =>
  usage.currentReading >= nextUsageThreshold(s, usage.lastServiceReading);
