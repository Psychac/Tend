import {
  consolidateMissed,
  localDateOf,
  ok,
  pauseSchedule,
  resumeSchedule,
  type Result,
  type Schedule,
  type ScheduleId,
} from '@tend/domain';
import { auditEvent, found, transact, type Deps } from './deps';
import { ensureOccurrences } from './generation';

export async function pauseActivitySchedule(
  deps: Deps,
  input: { scheduleId: ScheduleId },
): Promise<Result<Schedule>> {
  return transact(deps, async (repos) => {
    const loaded = found(
      'Schedule',
      input.scheduleId,
      await repos.schedules.getById(input.scheduleId),
    );
    if (!loaded.ok) return loaded;
    const paused = pauseSchedule(loaded.value, deps.clock.now());
    if (!paused.ok) return paused;
    await repos.schedules.save(paused.value);
    await repos.audit.add(auditEvent(deps, 'schedule', paused.value.id, 'updated', 'paused'));
    return ok(paused.value);
  });
}

/** Resuming generates occurrences from today onward; the paused period is not back-filled. */
export async function resumeActivitySchedule(
  deps: Deps,
  input: { scheduleId: ScheduleId },
): Promise<Result<Schedule>> {
  return transact(deps, async (repos) => {
    const loaded = found(
      'Schedule',
      input.scheduleId,
      await repos.schedules.getById(input.scheduleId),
    );
    if (!loaded.ok) return loaded;
    const resumed = resumeSchedule(loaded.value, deps.clock.now());
    if (!resumed.ok) return resumed;
    const activity = found(
      'Activity',
      resumed.value.activityId,
      await repos.activities.getById(resumed.value.activityId),
    );
    if (!activity.ok) return activity;

    await repos.schedules.save(resumed.value);
    await ensureOccurrences(deps, repos, activity.value, resumed.value);
    await repos.audit.add(auditEvent(deps, 'schedule', resumed.value.id, 'updated', 'resumed'));
    return ok(resumed.value);
  });
}

export interface ReconcileSummary {
  readonly created: number;
  readonly missed: number;
}

/**
 * Run on startup and when the app resumes (spec 11). Marks piles of
 * overdue occurrences as missed and fills in whatever each active schedule is missing.
 * Safe to run repeatedly.
 */
export async function reconcileSchedules(deps: Deps): Promise<Result<ReconcileSummary>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    let created = 0;
    let missed = 0;

    for (const schedule of await repos.schedules.list()) {
      if (schedule.pausedAt !== undefined) continue;
      const activity = await repos.activities.getById(schedule.activityId);
      if (!activity || activity.archivedAt !== undefined) continue;

      const today = localDateOf(now, schedule.timeZone);
      const outstanding = await repos.occurrences.list({
        activityId: activity.id,
        status: ['pending', 'snoozed'],
      });
      for (const o of consolidateMissed(outstanding, today, now)) {
        await repos.occurrences.save(o);
        missed += 1;
      }
      created += (await ensureOccurrences(deps, repos, activity, schedule)).length;
    }
    return ok({ created, missed });
  });
}
