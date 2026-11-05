import { err, invariantError, ok } from '../core';
import type { DomainError, Instant, LocalDate, Result } from '../core';
import { touch } from '../entities/meta';
import { transitionOccurrence, type Occurrence } from '../entities/occurrence';
import type { Schedule } from '../entities/schedule';
import { addDays } from './local-date';

export type OccurrenceTiming = 'upcoming' | 'due' | 'in_grace' | 'overdue';

const isOutstanding = (o: Occurrence): boolean => o.status === 'pending' || o.status === 'snoozed';

/** A snoozed occurrence is due on its snooze date rather than its original date. */
export const effectiveDueOn = (o: Occurrence): LocalDate =>
  o.status === 'snoozed' && o.snoozedUntil ? o.snoozedUntil : o.dueOn;

/** Where an outstanding occurrence stands today; null once it is resolved. */
export function classifyOccurrence(
  o: Occurrence,
  graceDays: number,
  today: LocalDate,
): OccurrenceTiming | null {
  if (!isOutstanding(o)) return null;
  const due = effectiveDueOn(o);
  if (today < due) return 'upcoming';
  if (today === due) return 'due';
  return today <= addDays(due, graceDays) ? 'in_grace' : 'overdue';
}

/** Moves an outstanding occurrence to a new due date and clears any snooze. */
export function rescheduleOccurrence(
  o: Occurrence,
  newDueOn: LocalDate,
  now: Instant,
): Result<Occurrence, DomainError> {
  if (!isOutstanding(o)) {
    return err(invariantError(`Cannot reschedule a ${o.status} occurrence`));
  }
  return ok({
    ...o,
    meta: touch(o.meta, now),
    dueOn: newDueOn,
    status: 'pending',
    snoozedUntil: undefined,
    resolvedAt: undefined,
  });
}

export function pauseSchedule(s: Schedule, now: Instant): Result<Schedule, DomainError> {
  if (s.pausedAt !== undefined) return err(invariantError('Schedule is already paused'));
  return ok({ ...s, meta: touch(s.meta, now), pausedAt: now });
}

/**
 * Resuming never back-fills the paused period: generation only looks forward
 * from today, so nothing appears for the dates that passed while paused.
 */
export function resumeSchedule(s: Schedule, now: Instant): Result<Schedule, DomainError> {
  if (s.pausedAt === undefined) return err(invariantError('Schedule is not paused'));
  return ok({ ...s, meta: touch(s.meta, now), pausedAt: undefined });
}

/**
 * Missed-occurrence consolidation (spec 6.5). When several occurrences of the
 * same activity are past due, keep only the most recent and supersede the
 * rest, so a long absence yields one overdue item instead of a pile.
 * Superseded occurrences stay in history; nothing is deleted.
 */
export function consolidateMissed(
  occurrences: readonly Occurrence[],
  today: LocalDate,
  now: Instant,
): Occurrence[] {
  const missed = occurrences.filter((o) => isOutstanding(o) && effectiveDueOn(o) < today);
  const byActivity = new Map<string, Occurrence[]>();
  for (const o of missed) {
    const group = byActivity.get(o.activityId) ?? [];
    group.push(o);
    byActivity.set(o.activityId, group);
  }

  const superseded: Occurrence[] = [];
  for (const group of byActivity.values()) {
    group.sort((a, b) => (effectiveDueOn(a) < effectiveDueOn(b) ? -1 : 1));
    for (const o of group.slice(0, -1)) {
      const r = transitionOccurrence(o, 'superseded', now);
      if (r.ok) superseded.push(r.value);
    }
  }
  return superseded;
}

export type ScheduleChangePolicy = 'keep_outstanding' | 'supersede_future';

export interface ScheduleChangePlan {
  readonly superseded: Occurrence[];
  /** Due dates that still have an outstanding occurrence; pass as `existingDueDates` to generation. */
  readonly keptDueDates: LocalDate[];
}

/**
 * Applies an explicit policy to outstanding occurrences when a schedule
 * changes, instead of silently deleting them (spec 6.5). Past-due occurrences
 * are always kept: they are real, unresolved work.
 *
 * - `keep_outstanding`: leave everything in place.
 * - `supersede_future`: supersede future occurrences that the new schedule
 *   would not produce (`newDueDates`).
 */
export function planScheduleChange(
  outstanding: readonly Occurrence[],
  newDueDates: readonly LocalDate[],
  policy: ScheduleChangePolicy,
  today: LocalDate,
  now: Instant,
): ScheduleChangePlan {
  const wanted = new Set(newDueDates);
  const superseded: Occurrence[] = [];
  const keptDueDates: LocalDate[] = [];

  for (const o of outstanding.filter(isOutstanding)) {
    const due = effectiveDueOn(o);
    const drop = policy === 'supersede_future' && due >= today && !wanted.has(due);
    const r = drop ? transitionOccurrence(o, 'superseded', now) : null;
    if (r?.ok) superseded.push(r.value);
    else keptDueDates.push(o.dueOn);
  }
  return { superseded, keptDueDates };
}
