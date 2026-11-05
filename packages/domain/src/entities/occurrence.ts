import { invariantError, err, ok, type ActivityId, type DomainError, type Instant } from '../core';
import type { LocalDate, OccurrenceId, Result, ScheduleId } from '../core';
import { touch, type EntityMeta } from './meta';

export type OccurrenceStatus =
  'pending' | 'completed' | 'skipped' | 'snoozed' | 'superseded' | 'cancelled';

export interface Occurrence {
  readonly id: OccurrenceId;
  readonly meta: EntityMeta;
  readonly activityId: ActivityId;
  readonly scheduleId?: ScheduleId | undefined;
  readonly dueOn: LocalDate;
  readonly status: OccurrenceStatus;
  /** When the occurrence reached its current status. Kept so history stays faithful. */
  readonly resolvedAt?: Instant | undefined;
  readonly snoozedUntil?: LocalDate | undefined;
}

const ALLOWED: Readonly<Record<OccurrenceStatus, readonly OccurrenceStatus[]>> = {
  pending: ['completed', 'skipped', 'snoozed', 'superseded', 'cancelled'],
  snoozed: ['pending', 'completed', 'skipped', 'superseded', 'cancelled'],
  completed: [],
  skipped: [],
  superseded: [],
  cancelled: [],
};

export const canTransition = (from: OccurrenceStatus, to: OccurrenceStatus): boolean =>
  ALLOWED[from].includes(to);

export function transitionOccurrence(
  occurrence: Occurrence,
  to: OccurrenceStatus,
  now: Instant,
  options: { snoozedUntil?: LocalDate } = {},
): Result<Occurrence, DomainError> {
  if (!canTransition(occurrence.status, to)) {
    return err(invariantError(`Cannot move occurrence from ${occurrence.status} to ${to}`));
  }
  if (to === 'snoozed' && !options.snoozedUntil) {
    return err(invariantError('Snoozing requires a snoozedUntil date'));
  }
  if (to === 'snoozed' && options.snoozedUntil && options.snoozedUntil <= occurrence.dueOn) {
    return err(invariantError('snoozedUntil must be after the due date'));
  }
  return ok({
    ...occurrence,
    meta: touch(occurrence.meta, now),
    status: to,
    // Snooze and return-to-pending are not resolutions.
    resolvedAt: to === 'snoozed' || to === 'pending' ? undefined : now,
    snoozedUntil: to === 'snoozed' ? options.snoozedUntil : undefined,
  });
}

/**
 * Puts a completed occurrence back to pending, when its completion is undone.
 * Deliberately separate from `transitionOccurrence`: resolved work stays
 * resolved except through an undo, which also records a void on the completion.
 */
export function reopenOccurrence(
  occurrence: Occurrence,
  now: Instant,
): Result<Occurrence, DomainError> {
  if (occurrence.status !== 'completed') {
    return err(invariantError(`Only completed work can be reopened, not ${occurrence.status}`));
  }
  return ok({
    ...occurrence,
    meta: touch(occurrence.meta, now),
    status: 'pending',
    resolvedAt: undefined,
    snoozedUntil: undefined,
  });
}
