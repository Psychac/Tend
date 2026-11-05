import type { Repositories } from '@upkeep/contracts';
import {
  addDays,
  classifyOccurrence,
  daysBetween,
  effectiveDueOn,
  localDateOf,
  type Activity,
  type ActivityId,
  type Clock,
  type Completion,
  type LocalDate,
  type Occurrence,
  type OccurrenceTiming,
  type Schedule,
  type TimeZoneId,
} from '@upkeep/domain';

export interface OccurrenceItem {
  readonly occurrence: Occurrence;
  readonly activity: Activity;
  readonly schedule?: Schedule | undefined;
  readonly timing: OccurrenceTiming;
  /** The date it is actually due: the snooze date if snoozed. */
  readonly dueOn: LocalDate;
  /** Whole days past `dueOn`; 0 when not yet late. */
  readonly daysLate: number;
}

export interface RecentCompletion {
  readonly completion: Completion;
  readonly activityName: string;
}

export interface DashboardView {
  readonly today: LocalDate;
  /** Past due, oldest first. Items still inside their grace period are included (timing `in_grace`). */
  readonly overdue: readonly OccurrenceItem[];
  readonly dueToday: readonly OccurrenceItem[];
  readonly upcoming: readonly OccurrenceItem[];
  readonly recentCompletions: readonly RecentCompletion[];
}

export interface DashboardOptions {
  /** The user's current zone; decides what "today" means. */
  readonly timeZone: TimeZoneId;
  readonly upcomingDays?: number | undefined;
  readonly recentLimit?: number | undefined;
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

/** Everything the dashboard shows, computed from local data. */
export async function getDashboard(
  repos: Repositories,
  clock: Clock,
  options: DashboardOptions,
): Promise<DashboardView> {
  const today = localDateOf(clock.now(), options.timeZone);
  const horizon = addDays(today, options.upcomingDays ?? 14);

  const [outstanding, activities, schedules, completions] = await Promise.all([
    repos.occurrences.list({ status: ['pending', 'snoozed'] }),
    repos.activities.list({ includeArchived: true }),
    repos.schedules.list(),
    repos.completions.list({ limit: options.recentLimit ?? 5 }),
  ]);
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));

  const items: OccurrenceItem[] = [];
  for (const occurrence of outstanding) {
    const activity = activityById.get(occurrence.activityId);
    if (!activity || activity.archivedAt !== undefined) continue;
    const schedule = occurrence.scheduleId ? scheduleById.get(occurrence.scheduleId) : undefined;
    const timing = classifyOccurrence(occurrence, schedule?.policy.graceDays ?? 0, today);
    if (!timing) continue;
    const dueOn = effectiveDueOn(occurrence);
    items.push({
      occurrence,
      activity,
      schedule,
      timing,
      dueOn,
      daysLate: dueOn < today ? daysBetween(dueOn, today) : 0,
    });
  }

  const byDue = (a: OccurrenceItem, b: OccurrenceItem) =>
    a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : a.activity.name.localeCompare(b.activity.name);
  const byPriority = (a: OccurrenceItem, b: OccurrenceItem) =>
    PRIORITY_RANK[a.activity.priority] - PRIORITY_RANK[b.activity.priority] ||
    a.activity.name.localeCompare(b.activity.name);

  return {
    today,
    overdue: items.filter((i) => i.dueOn < today).sort(byDue),
    dueToday: items.filter((i) => i.dueOn === today).sort(byPriority),
    upcoming: items.filter((i) => i.dueOn > today && i.dueOn <= horizon).sort(byDue),
    recentCompletions: completions.map((completion) => ({
      completion,
      activityName: activityById.get(completion.activityId)?.name ?? 'Deleted activity',
    })),
  };
}

export interface ActivityListItem {
  readonly activity: Activity;
  readonly schedules: readonly Schedule[];
  /** Due date of the nearest outstanding occurrence, if any. */
  readonly nextDueOn?: LocalDate | undefined;
}

export interface ActivityListOptions {
  readonly search?: string | undefined;
  readonly includeArchived?: boolean | undefined;
}

export async function listActivities(
  repos: Repositories,
  options: ActivityListOptions = {},
): Promise<ActivityListItem[]> {
  const [activities, schedules, outstanding] = await Promise.all([
    repos.activities.list({ search: options.search, includeArchived: options.includeArchived }),
    repos.schedules.list(),
    repos.occurrences.list({ status: ['pending', 'snoozed'] }),
  ]);
  const nextByActivity = new Map<ActivityId, LocalDate>();
  for (const o of outstanding) {
    const due = effectiveDueOn(o);
    const current = nextByActivity.get(o.activityId);
    if (!current || due < current) nextByActivity.set(o.activityId, due);
  }
  return activities.map((activity) => ({
    activity,
    schedules: schedules.filter((s) => s.activityId === activity.id),
    nextDueOn: nextByActivity.get(activity.id),
  }));
}
