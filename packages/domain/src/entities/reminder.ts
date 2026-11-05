import { Issues } from '../core';
import type {
  ActivityId,
  DomainError,
  Instant,
  LocalDate,
  OccurrenceId,
  ReminderDeliveryId,
  ReminderId,
  Result,
  TimeZoneId,
  UserId,
} from '../core';
import { addDays } from '../scheduling/local-date';
import { instantFromLocal } from '../scheduling/zone';
import { newMeta, type EntityMeta } from './meta';
import { effectiveDueOn } from '../scheduling/policy';
import type { Occurrence } from './occurrence';

/**
 * A request to be reminded about an activity: `leadDays` before each due date
 * (0 is the day itself), at `atTime` on the wall clock. It is only a delivery
 * preference; whether work is due is decided by scheduling (spec 11).
 */
export interface Reminder {
  readonly id: ReminderId;
  readonly meta: EntityMeta;
  readonly activityId: ActivityId;
  readonly leadDays: number;
  /** "HH:MM", 24-hour. */
  readonly atTime: string;
  readonly enabled: boolean;
}

export interface NewReminder {
  readonly id: ReminderId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly activityId: ActivityId;
  readonly leadDays?: number | undefined;
  readonly atTime?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export const DEFAULT_REMINDER_TIME = '09:00';
export const MAX_REMINDER_LEAD_DAYS = 365;

const validTime = (t: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export function createReminder(input: NewReminder): Result<Reminder, DomainError> {
  const leadDays = input.leadDays ?? 0;
  const atTime = input.atTime ?? DEFAULT_REMINDER_TIME;
  const issues = new Issues();
  issues.check(
    Number.isInteger(leadDays) && leadDays >= 0 && leadDays <= MAX_REMINDER_LEAD_DAYS,
    'leadDays',
    `must be a whole number from 0 to ${MAX_REMINDER_LEAD_DAYS}`,
  );
  issues.check(validTime(atTime), 'atTime', 'must be a time like 09:00');
  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    activityId: input.activityId,
    leadDays,
    atTime,
    enabled: input.enabled ?? true,
  }));
}

/**
 * Proof that a reminder was delivered for one piece of work, so it is not
 * delivered twice. Keyed by the due date at the time: snoozing moves the due
 * date, which makes a fresh reminder due. Append-only.
 */
export interface ReminderDelivery {
  readonly id: ReminderDeliveryId;
  readonly meta: EntityMeta;
  readonly reminderId: ReminderId;
  readonly occurrenceId: OccurrenceId;
  readonly dueOn: LocalDate;
  readonly deliveredAt: Instant;
}

/** When this reminder should fire for this piece of work. */
export function reminderFireTime(
  reminder: Reminder,
  occurrence: Occurrence,
  timeZone: TimeZoneId,
): Instant {
  const day = addDays(effectiveDueOn(occurrence), -reminder.leadDays);
  return instantFromLocal(day, reminder.atTime, timeZone);
}

/** The key under which a delivery is remembered. */
export const deliveryKey = (
  reminderId: ReminderId,
  occurrenceId: OccurrenceId,
  dueOn: LocalDate,
): string => `${reminderId}|${occurrenceId}|${dueOn}`;
