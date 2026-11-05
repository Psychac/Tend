import type { Repositories } from '@upkeep/contracts';
import { locationPaths } from './organise';
import {
  addDays,
  classifyOccurrence,
  daysBetween,
  effectiveDueOn,
  localDateOf,
  type Activity,
  type ActivityId,
  type Clock,
  type CategoryId,
  type ChecklistItem,
  type LocationId,
  type Completion,
  type MeasurementRequirement,
  type Instant,
  type Measurement,
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
  readonly categoryName?: string | undefined;
  /** "Kitchen › Pantry" */
  readonly locationPath?: string | undefined;
  readonly schedules: readonly Schedule[];
  /** Due date of the nearest outstanding occurrence, if any. */
  readonly nextDueOn?: LocalDate | undefined;
}

export interface ActivityListOptions {
  readonly search?: string | undefined;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly includeArchived?: boolean | undefined;
}

export async function listActivities(
  repos: Repositories,
  options: ActivityListOptions = {},
): Promise<ActivityListItem[]> {
  const [activities, schedules, outstanding, categories, locations] = await Promise.all([
    repos.activities.list({
      search: options.search,
      categoryId: options.categoryId,
      locationId: options.locationId,
      includeArchived: options.includeArchived,
    }),
    repos.schedules.list(),
    repos.occurrences.list({ status: ['pending', 'snoozed'] }),
    repos.categories.list(),
    repos.locations.list(),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const paths = locationPaths(locations);
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
    categoryName: activity.categoryId ? categoryName.get(activity.categoryId) : undefined,
    locationPath: activity.locationId ? paths.get(activity.locationId) : undefined,
  }));
}

export type HistoryEntry =
  | {
      readonly kind: 'completed';
      readonly at: Instant;
      readonly activityId: ActivityId;
      readonly activityName: string;
      readonly completion: Completion;
      /** True when this replaced an earlier version, so the person can see it was corrected. */
      readonly edited: boolean;
      readonly checklist: readonly ChecklistItem[];
      readonly measurementRequirements: readonly MeasurementRequirement[];
      /** Whole days after the planned date it was done; negative if early, 0 if on time or unplanned. */
      readonly daysFromPlanned: number;
      readonly checklistDone: number;
      readonly checklistTotal: number;
      readonly measurements: readonly Measurement[];
    }
  | {
      readonly kind: 'skipped';
      readonly at: Instant;
      readonly activityId: ActivityId;
      readonly activityName: string;
      readonly occurrence: Occurrence;
    };

export interface HistoryOptions {
  readonly activityId?: ActivityId | undefined;
  readonly kind?: 'completed' | 'skipped' | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
  /** Needed to read dates in the user's own zone. */
  readonly timeZone: TimeZoneId;
}

export interface HistoryPage {
  readonly entries: readonly HistoryEntry[];
  readonly hasMore: boolean;
}

/**
 * What happened, newest first: completions (with planned-versus-actual timing,
 * cost, checklist progress and measurements) and skipped occurrences. Archived
 * and deleted activities still appear, because history is never rewritten.
 */
export async function getHistory(
  repos: Repositories,
  options: HistoryOptions,
): Promise<HistoryPage> {
  const limit = options.limit ?? 30;
  const offset = options.offset ?? 0;
  const need = offset + limit + 1;
  const wantCompleted = options.kind !== 'skipped';
  const wantSkipped = options.kind !== 'completed';

  const [activities, completions, skipped, voids] = await Promise.all([
    repos.activities.list({ includeArchived: true }),
    wantCompleted
      ? repos.completions.list({ activityId: options.activityId, limit: need })
      : Promise.resolve([]),
    wantSkipped
      ? repos.occurrences.list({
          activityId: options.activityId,
          status: ['skipped'],
          order: 'due_desc',
          limit: need,
        })
      : Promise.resolve([]),
    repos.completionVoids.list(),
  ]);
  const replacements = new Set(voids.flatMap((v) => (v.replacedBy ? [v.replacedBy] : [])));
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const nameOf = new Map(activities.map((a) => [a.id, a.name]));
  const checklistTotalOf = new Map(activities.map((a) => [a.id, a.checklist.length]));

  const oldestCompletion = completions.at(-1)?.completedAt;
  const measurements = oldestCompletion
    ? await repos.measurements.list({ activityId: options.activityId, from: oldestCompletion })
    : [];

  const entries: HistoryEntry[] = [
    ...completions.map((completion): HistoryEntry => {
      const planned = completion.plannedFor;
      const doneOn = localDateOf(completion.completedAt, options.timeZone);
      return {
        kind: 'completed',
        at: completion.completedAt,
        activityId: completion.activityId,
        activityName: nameOf.get(completion.activityId) ?? 'Deleted activity',
        completion,
        edited: replacements.has(completion.id),
        checklist: activityById.get(completion.activityId)?.checklist ?? [],
        measurementRequirements:
          activityById.get(completion.activityId)?.measurementRequirements ?? [],
        daysFromPlanned: planned ? daysBetween(planned, doneOn) : 0,
        checklistDone: completion.checklistResults.filter((r) => r.done).length,
        checklistTotal: checklistTotalOf.get(completion.activityId) ?? 0,
        measurements: measurements.filter((m) => m.completionId === completion.id),
      };
    }),
    ...skipped.map((occurrence): HistoryEntry => ({
      kind: 'skipped',
      at: occurrence.resolvedAt ?? occurrence.meta.updatedAt,
      activityId: occurrence.activityId,
      activityName: nameOf.get(occurrence.activityId) ?? 'Deleted activity',
      occurrence,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return {
    entries: entries.slice(offset, offset + limit),
    hasMore: entries.length > offset + limit,
  };
}
