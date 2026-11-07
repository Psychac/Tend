import {
  err,
  invariantError,
  localDateOf,
  ok,
  transitionOccurrence,
  validationError,
  type ActivityId,
  type Completion,
  type Measurement,
  type Occurrence,
  type Result,
} from '@tend/domain';
import { auditEvent, found, transact, type Deps } from './deps';
import { ensureOccurrences, triggerConditionSchedules, triggerEventSchedules } from './generation';
import { buildCompletion, type CompletionDetails } from './occurrences';

export interface LogCompletionResult {
  readonly completion: Completion;
  readonly measurements: readonly Measurement[];
  /** Occurrences created because of this completion (a restarted interval, a follow-up). */
  readonly nextOccurrences: readonly Occurrence[];
}

/**
 * Records that an activity was done, without tying it to anything that was due: a one-off,
 * work done early, or work nobody scheduled. It counts in History, Insights and spending, but
 * not towards "done on time", because nothing was planned for it.
 *
 * It never resolves an existing occurrence. To tick off something that is due, complete that
 * occurrence instead. What it does change:
 *  - an "after I complete it" schedule restarts from this date, if this is now the latest
 *    completion (a backdated entry does not move it);
 *  - activities that follow this one, and condition schedules watching its readings, can fire.
 * Calendar and usage schedules are left alone.
 */
export async function logCompletion(
  deps: Deps,
  input: { activityId: ActivityId } & CompletionDetails,
): Promise<Result<LogCompletionResult>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const { activityId, ...details } = input;

    const activity = found('Activity', activityId, await repos.activities.getById(activityId));
    if (!activity.ok) return activity;
    if (activity.value.archivedAt !== undefined) {
      return err(invariantError('Restore this activity before logging it as done'));
    }

    const built = buildCompletion(deps, activity.value, undefined, details, now);
    if (!built.ok) return built;
    const { completion, measurements } = built.value;
    if (Date.parse(completion.completedAt) > Date.parse(now)) {
      return err(validationError([{ path: 'completedAt', message: 'cannot be in the future' }]));
    }

    await repos.completions.add(completion);
    for (const m of measurements) await repos.measurements.add(m);
    await repos.audit.add(
      auditEvent(deps, 'completion', completion.id, 'created', `${activity.value.name}: logged`),
    );

    const nextOccurrences: Occurrence[] = [];

    // After-completion schedules count from the latest completion.
    const [latest] = await repos.completions.list({ activityId, limit: 1 });
    if (latest?.id === completion.id) {
      const open = await repos.occurrences.list({ activityId, status: ['pending', 'snoozed'] });
      for (const schedule of await repos.schedules.listForActivity(activityId)) {
        if (schedule.strategy.kind !== 'completion_interval' || schedule.pausedAt !== undefined) {
          continue;
        }
        for (const other of open.filter((o) => o.scheduleId === schedule.id)) {
          const gone = transitionOccurrence(other, 'superseded', now);
          if (gone.ok) await repos.occurrences.save(gone.value);
        }
        nextOccurrences.push(
          ...(await ensureOccurrences(deps, repos, activity.value, schedule, {
            lastResolvedOn: localDateOf(completion.completedAt, schedule.timeZone),
          })),
        );
      }
    }

    for (const m of measurements) {
      nextOccurrences.push(...(await triggerConditionSchedules(deps, repos, m)));
    }
    nextOccurrences.push(
      ...(await triggerEventSchedules(deps, repos, activity.value, completion.completedAt)),
    );

    return ok({ completion, measurements, nextOccurrences });
  });
}
