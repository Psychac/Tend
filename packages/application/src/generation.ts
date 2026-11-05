import type { Repositories } from '@tend/contracts';
import {
  localDateOf,
  missingDueDates,
  newMeta,
  type Activity,
  type LocalDate,
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
            // Superseded and cancelled work no longer counts: its date may legitimately return
            // (for example when an archived activity is restored).
            .filter((o) => o.status !== 'superseded' && o.status !== 'cancelled')
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
