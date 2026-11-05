import type { Repositories } from '@tend/contracts';
import {
  addDays,
  classifyOccurrence,
  daysBetween,
  effectiveDueOn,
  fromParts,
  localDateOf,
  missingDueDates,
  startOfDayInstant,
  type ActivityId,
  type LocalDate,
  type OccurrenceId,
  type TimeZoneId,
} from '@tend/domain';

export type CalendarEntryKind =
  /** Outstanding and past its due date (including grace). */
  | 'overdue'
  /** Outstanding and due, or still inside its grace period. */
  | 'due'
  | 'done'
  | 'skipped'
  /** Not created yet: computed from the schedule so future months are not empty. */
  | 'projected';

export interface CalendarEntry {
  readonly kind: CalendarEntryKind;
  readonly activityId: ActivityId;
  readonly activityName: string;
  readonly occurrenceId?: OccurrenceId | undefined;
}

export interface CalendarDay {
  readonly date: LocalDate;
  readonly inMonth: boolean;
  readonly entries: readonly CalendarEntry[];
}

export interface CalendarMonth {
  readonly year: number;
  /** 1-12 */
  readonly month: number;
  /** Whole weeks from Monday to Sunday, covering the month. */
  readonly weeks: readonly (readonly CalendarDay[])[];
}

export interface CalendarOptions {
  readonly year: number;
  readonly month: number;
  readonly today: LocalDate;
  readonly timeZone: TimeZoneId;
}

/** Monday on or before the 1st, through the Sunday on or after the last day. */
function gridRange(year: number, month: number): { first: LocalDate; last: LocalDate } {
  const start = fromParts(year, month, 1);
  const next = month === 12 ? fromParts(year + 1, 1, 1) : fromParts(year, month + 1, 1);
  const end = addDays(next, -1);
  const weekday = (d: LocalDate) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  return { first: addDays(start, -weekday(start)), last: addDays(end, 6 - weekday(end)) };
}

/**
 * Everything that happens on each day of a month grid: what is due, overdue,
 * done or skipped, plus upcoming occurrences projected from calendar-based
 * schedules. Past days show only what actually happened.
 */
export async function getCalendarMonth(
  repos: Repositories,
  options: CalendarOptions,
): Promise<CalendarMonth> {
  const { first, last } = gridRange(options.year, options.month);
  const [activities, schedules, outstanding, skipped, completions] = await Promise.all([
    repos.activities.list({ includeArchived: true }),
    repos.schedules.list(),
    repos.occurrences.list({ status: ['pending', 'snoozed'] }),
    repos.occurrences.list({ status: ['skipped'], dueFrom: first, dueTo: last }),
    repos.completions.list({
      from: startOfDayInstant(first, options.timeZone),
      to: startOfDayInstant(addDays(last, 1), options.timeZone),
    }),
  ]);
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  const nameOf = (id: ActivityId) => activityById.get(id)?.name ?? 'Deleted activity';

  const byDate = new Map<LocalDate, CalendarEntry[]>();
  const put = (date: LocalDate, entry: CalendarEntry) => {
    if (date < first || date > last) return;
    byDate.set(date, [...(byDate.get(date) ?? []), entry]);
  };
  /** `activityId|date` pairs that are already represented, so projections never duplicate them. */
  const covered = new Set<string>();

  for (const o of outstanding) {
    const activity = activityById.get(o.activityId);
    if (!activity || activity.archivedAt !== undefined) continue;
    const due = effectiveDueOn(o);
    covered.add(`${o.activityId}|${due}`);
    const timing = classifyOccurrence(
      o,
      (o.scheduleId ? scheduleById.get(o.scheduleId)?.policy.graceDays : 0) ?? 0,
      options.today,
    );
    put(due, {
      kind: timing === 'overdue' ? 'overdue' : 'due',
      activityId: o.activityId,
      activityName: activity.name,
      occurrenceId: o.id,
    });
  }

  for (const o of skipped) {
    covered.add(`${o.activityId}|${o.dueOn}`);
    put(o.dueOn, {
      kind: 'skipped',
      activityId: o.activityId,
      activityName: nameOf(o.activityId),
      occurrenceId: o.id,
    });
  }

  for (const c of completions) {
    // Shown on the day it was actually done; its planned day is covered too.
    if (c.plannedFor) covered.add(`${c.activityId}|${c.plannedFor}`);
    put(localDateOf(c.completedAt, options.timeZone), {
      kind: 'done',
      activityId: c.activityId,
      activityName: nameOf(c.activityId),
      occurrenceId: c.occurrenceId,
    });
  }

  // Project forward from today for schedules whose dates can be known in advance.
  const projectFrom = options.today > first ? options.today : first;
  if (projectFrom <= last) {
    for (const schedule of schedules) {
      const activity = activityById.get(schedule.activityId);
      if (!activity || activity.archivedAt !== undefined) continue;
      const kind = schedule.strategy.kind;
      if (kind !== 'calendar' && kind !== 'fixed_interval') continue;
      const dates = missingDueDates(schedule, {
        today: projectFrom,
        horizonDays: daysBetween(projectFrom, last),
        maxOccurrences: 366,
        existingDueDates: [],
      });
      for (const date of dates) {
        if (covered.has(`${activity.id}|${date}`)) continue;
        put(date, { kind: 'projected', activityId: activity.id, activityName: activity.name });
      }
    }
  }

  const weeks: CalendarDay[][] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const index = daysBetween(first, d);
    if (index % 7 === 0) weeks.push([]);
    const inMonth = d.slice(0, 7) === `${options.year}-${String(options.month).padStart(2, '0')}`;
    weeks[weeks.length - 1]!.push({
      date: d,
      inMonth,
      entries: (byDate.get(d) ?? []).sort((a, b) => a.activityName.localeCompare(b.activityName)),
    });
  }
  return { year: options.year, month: options.month, weeks };
}
