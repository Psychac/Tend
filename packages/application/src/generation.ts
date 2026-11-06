import type { Repositories } from '@tend/contracts';
import {
  crossedCondition,
  eventDueDate,
  localDateOf,
  missingDueDates,
  newMeta,
  type Activity,
  type Instant,
  type LocalDate,
  type Measurement,
  type Occurrence,
  type Schedule,
  type UsageReading,
} from '@tend/domain';
import type { Deps } from './deps';

const OUTSTANDING = ['pending', 'snoozed'] as const;

/**
 * The most recent date work was resolved: the latest completion or skip.
 * Used to restart completion-interval schedules.
 */
export async function lastResolvedOn(
  repos: Repositories,
  schedule: Schedule,
): Promise<LocalDate | undefined> {
  const [completion] = await repos.completions.list({
    activityId: schedule.activityId,
    limit: 1,
  });
  const [skipped] = await repos.occurrences.list({
    activityId: schedule.activityId,
    status: ['skipped'],
    order: 'due_desc',
    limit: 1,
  });
  const dates = [
    completion && localDateOf(completion.completedAt, schedule.timeZone),
    skipped?.resolvedAt && localDateOf(skipped.resolvedAt, schedule.timeZone),
  ].filter((d): d is LocalDate => d !== undefined && d !== null);
  return dates.length > 0 ? dates.reduce((a, b) => (a >= b ? a : b)) : undefined;
}

/**
 * Meter readings for a usage schedule. The last service reading is the most
 * recent reading recorded with a completion; before any service it falls back
 * to the earliest reading, so a car first logged at 42,000 km is not instantly due.
 */
export async function usageReading(
  repos: Repositories,
  activity: Activity,
  meterKey: string,
): Promise<UsageReading | undefined> {
  const subject = activity.assetId ? { assetId: activity.assetId } : { activityId: activity.id };
  const readings: { value: number; serviced: boolean }[] = [];
  for (const m of await repos.measurements.list({ ...subject, key: meterKey, limit: 500 })) {
    if (m.value.kind === 'numeric') {
      readings.push({ value: m.value.quantity.value, serviced: m.completionId !== undefined });
    }
  }
  const current = readings[0];
  if (!current) return undefined;
  const lastService = readings.find((r) => r.serviced);
  const earliest = readings[readings.length - 1] ?? current;
  return {
    currentReading: current.value,
    lastServiceReading: (lastService ?? earliest).value,
  };
}

/**
 * Event-based schedules: completing `completed` triggers an occurrence of every
 * activity whose schedule says "after <completed>". The due date is the
 * completion's date plus the schedule's delay.
 *
 * A schedule keeps at most one open occurrence, so completing the trigger again
 * before the previous follow-up is done does not pile up duplicates. Triggers
 * fire only from a person's completion, never from each other, so two activities
 * that follow one another cannot loop.
 */
export async function triggerEventSchedules(
  deps: Deps,
  repos: Repositories,
  completed: Activity,
  completedAt: Instant,
): Promise<Occurrence[]> {
  const now = deps.clock.now();
  const created: Occurrence[] = [];
  for (const schedule of await repos.schedules.list()) {
    const s = schedule.strategy;
    if (s.kind !== 'event' || s.afterActivityId !== completed.id) continue;
    if (schedule.pausedAt !== undefined) continue;

    const target = await repos.activities.getById(schedule.activityId);
    if (!target || target.archivedAt !== undefined) continue;

    const dueOn = eventDueDate(s, localDateOf(completedAt, schedule.timeZone));
    if (dueOn < schedule.startsOn || (schedule.endsOn !== undefined && dueOn > schedule.endsOn)) {
      continue;
    }
    const open = await repos.occurrences.list({
      activityId: schedule.activityId,
      status: OUTSTANDING,
    });
    if (open.some((o) => o.scheduleId === schedule.id)) continue;

    const occurrence: Occurrence = {
      id: deps.ids.next<'Occurrence'>(),
      meta: newMeta(deps.ownerId, now),
      activityId: schedule.activityId,
      scheduleId: schedule.id,
      dueOn,
      status: 'pending',
    };
    await repos.occurrences.save(occurrence);
    created.push(occurrence);
  }
  return created;
}

/**
 * Condition-based schedules: a new numeric reading that crosses a schedule's
 * threshold creates one occurrence, due today. Only the newest reading counts
 * (a backdated one cannot fire), and it is compared with the reading before it,
 * so staying past the threshold does not fire again until it has come back.
 * A schedule keeps at most one open occurrence.
 */
export async function triggerConditionSchedules(
  deps: Deps,
  repos: Repositories,
  measurement: Measurement,
): Promise<Occurrence[]> {
  if (measurement.value.kind !== 'numeric') return [];
  const current = measurement.value.quantity.value;
  const now = deps.clock.now();
  const created: Occurrence[] = [];
  let readings: Measurement[] | undefined;

  for (const schedule of await repos.schedules.list()) {
    const s = schedule.strategy;
    if (s.kind !== 'condition' || s.measurementKey !== measurement.key) continue;
    if (schedule.pausedAt !== undefined) continue;

    const activity = await repos.activities.getById(schedule.activityId);
    if (!activity || activity.archivedAt !== undefined) continue;
    const watches =
      (measurement.assetId !== undefined && activity.assetId === measurement.assetId) ||
      (measurement.activityId !== undefined && activity.id === measurement.activityId);
    if (!watches) continue;

    const subject = measurement.assetId
      ? { assetId: measurement.assetId }
      : { activityId: measurement.activityId };
    readings ??= await repos.measurements.list({ ...subject, key: measurement.key, limit: 50 });
    const numeric = readings.filter((m) => m.value.kind === 'numeric');
    if (numeric[0]?.id !== measurement.id) continue;
    const before = numeric[1];
    const previous = before?.value.kind === 'numeric' ? before.value.quantity.value : undefined;
    if (!crossedCondition(s, previous, current)) continue;

    const today = localDateOf(now, schedule.timeZone);
    if (today < schedule.startsOn || (schedule.endsOn !== undefined && today > schedule.endsOn)) {
      continue;
    }
    const open = await repos.occurrences.list({
      activityId: schedule.activityId,
      status: OUTSTANDING,
    });
    if (open.some((o) => o.scheduleId === schedule.id)) continue;

    const occurrence: Occurrence = {
      id: deps.ids.next<'Occurrence'>(),
      meta: newMeta(deps.ownerId, now),
      activityId: schedule.activityId,
      scheduleId: schedule.id,
      dueOn: today,
      status: 'pending',
    };
    await repos.occurrences.save(occurrence);
    created.push(occurrence);
  }
  return created;
}

/**
 * Creates and saves whichever occurrences the schedule is missing. Idempotent:
 * existing occurrences (of any status, from today on) are never duplicated.
 */
export async function ensureOccurrences(
  deps: Deps,
  repos: Repositories,
  activity: Activity,
  schedule: Schedule,
  hint: { lastResolvedOn?: LocalDate } = {},
): Promise<Occurrence[]> {
  if (schedule.pausedAt !== undefined || activity.archivedAt !== undefined) return [];

  const now = deps.clock.now();
  const today = localDateOf(now, schedule.timeZone);
  const outstanding = await repos.occurrences.list({
    activityId: schedule.activityId,
    status: OUTSTANDING,
  });
  // Completion-interval and usage schedules have at most one open occurrence at a time.
  if (
    (schedule.strategy.kind === 'completion_interval' || schedule.strategy.kind === 'usage') &&
    outstanding.some((o) => o.scheduleId === schedule.id)
  ) {
    return [];
  }
  const upcoming = await repos.occurrences.list({
    activityId: schedule.activityId,
    dueFrom: today,
  });

  const dueDates = missingDueDates(schedule, {
    today,
    // Usage occurrences are always due "today"; the one-open-at-a-time rule above
    // already prevents duplicates, so a resolved same-day occurrence must not block a new one.
    existingDueDates:
      schedule.strategy.kind === 'usage'
        ? []
        : [...outstanding, ...upcoming]
            // Superseded work no longer counts: its date may legitimately return (for example
            // when an archived activity is restored). Cancelled work still does, so a date the
            // person removed is not generated again.
            .filter((o) => o.status !== 'superseded')
            .map((o) => o.dueOn),
    lastResolvedOn:
      schedule.strategy.kind === 'completion_interval'
        ? (hint.lastResolvedOn ?? (await lastResolvedOn(repos, schedule)))
        : undefined,
    usage:
      schedule.strategy.kind === 'usage'
        ? await usageReading(repos, activity, schedule.strategy.meterKey)
        : undefined,
  });

  const created: Occurrence[] = [];
  for (const dueOn of dueDates) {
    const occurrence: Occurrence = {
      id: deps.ids.next<'Occurrence'>(),
      meta: newMeta(deps.ownerId, now),
      activityId: schedule.activityId,
      scheduleId: schedule.id,
      dueOn,
      status: 'pending',
    };
    await repos.occurrences.save(occurrence);
    created.push(occurrence);
  }
  return created;
}
