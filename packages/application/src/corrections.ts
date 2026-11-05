import {
  createCompletionVoid,
  err,
  invariantError,
  ok,
  reopenOccurrence,
  transitionOccurrence,
  type Completion,
  type CompletionId,
  type Measurement,
  type Occurrence,
  type Result,
} from '@upkeep/domain';
import { auditEvent, found, transact, type Deps } from './deps';
import { buildCompletion, type CompletionDetails } from './occurrences';

const alreadyVoided = () => err(invariantError('This entry was already undone or corrected'));

/**
 * Undoes a completion, for example one tapped by mistake. The completion is
 * never deleted: a void is recorded beside it, so it stops counting everywhere
 * and the original stays on record. The work goes back to "due".
 */
export async function undoCompletion(
  deps: Deps,
  input: { completionId: CompletionId; reason?: string | undefined },
): Promise<Result<{ reopened?: Occurrence | undefined; superseded: number }>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const completion = found(
      'Completion',
      input.completionId,
      await repos.completions.getById(input.completionId),
    );
    if (!completion.ok) return completion;
    if (await repos.completionVoids.getByCompletion(completion.value.id)) return alreadyVoided();

    const voided = createCompletionVoid({
      id: deps.ids.next<'CompletionVoid'>(),
      ownerId: deps.ownerId,
      now,
      completionId: completion.value.id,
      reason: input.reason,
    });
    if (!voided.ok) return voided;

    let reopened: Occurrence | undefined;
    let superseded = 0;
    const occurrence = completion.value.occurrenceId
      ? await repos.occurrences.getById(completion.value.occurrenceId)
      : null;
    if (occurrence && occurrence.status === 'completed') {
      const back = reopenOccurrence(occurrence, now);
      if (!back.ok) return back;
      await repos.occurrences.save(back.value);
      reopened = back.value;

      // Completing may have created the next item (after-completion and usage schedules keep one
      // open at a time). Reopening the old one means that follow-on item must go.
      const schedule = occurrence.scheduleId
        ? await repos.schedules.getById(occurrence.scheduleId)
        : null;
      if (
        schedule &&
        (schedule.strategy.kind === 'completion_interval' || schedule.strategy.kind === 'usage')
      ) {
        const open = await repos.occurrences.list({
          activityId: occurrence.activityId,
          status: ['pending', 'snoozed'],
        });
        for (const other of open) {
          if (other.id === occurrence.id || other.scheduleId !== schedule.id) continue;
          const gone = transitionOccurrence(other, 'superseded', now);
          if (gone.ok) {
            await repos.occurrences.save(gone.value);
            superseded += 1;
          }
        }
      }
    }

    await repos.completionVoids.add(voided.value);
    const activity = await repos.activities.getById(completion.value.activityId);
    await repos.audit.add(
      auditEvent(
        deps,
        'completion',
        completion.value.id,
        'deleted',
        `${activity?.name ?? 'Activity'}: undone`,
      ),
    );
    return ok({ reopened, superseded });
  });
}

/**
 * Corrects a completion: saves the corrected version as a new completion and
 * voids the old one, pointing at its replacement. The person edits one entry;
 * underneath, the original is kept. The work stays done, on its original date
 * unless a new one is given.
 */
export async function correctCompletion(
  deps: Deps,
  input: { completionId: CompletionId; details: CompletionDetails },
): Promise<Result<{ completion: Completion; measurements: readonly Measurement[] }>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const original = found(
      'Completion',
      input.completionId,
      await repos.completions.getById(input.completionId),
    );
    if (!original.ok) return original;
    if (await repos.completionVoids.getByCompletion(original.value.id)) return alreadyVoided();
    if (!original.value.occurrenceId) {
      return err(invariantError('Only completions of scheduled work can be corrected'));
    }

    const activity = found(
      'Activity',
      original.value.activityId,
      await repos.activities.getById(original.value.activityId),
    );
    if (!activity.ok) return activity;
    const occurrence = found(
      'Occurrence',
      original.value.occurrenceId,
      await repos.occurrences.getById(original.value.occurrenceId),
    );
    if (!occurrence.ok) return occurrence;

    const built = buildCompletion(
      deps,
      activity.value,
      occurrence.value,
      { ...input.details, completedAt: input.details.completedAt ?? original.value.completedAt },
      now,
    );
    if (!built.ok) return built;
    const { completion, measurements } = built.value;

    const voided = createCompletionVoid({
      id: deps.ids.next<'CompletionVoid'>(),
      ownerId: deps.ownerId,
      now,
      completionId: original.value.id,
      replacedBy: completion.id,
    });
    if (!voided.ok) return voided;

    await repos.completions.add(completion);
    for (const m of measurements) await repos.measurements.add(m);
    await repos.completionVoids.add(voided.value);
    await repos.audit.add(
      auditEvent(deps, 'completion', completion.id, 'updated', `${activity.value.name}: corrected`),
    );
    return ok({ completion, measurements });
  });
}
