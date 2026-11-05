import type { Repositories } from '@upkeep/contracts';
import {
  createReminder,
  daysBetween,
  deliveryKey,
  effectiveDueOn,
  localDateOf,
  newMeta,
  ok,
  reminderFireTime,
  touch,
  type Activity,
  type ActivityId,
  type Instant,
  type LocalDate,
  type Occurrence,
  type Reminder,
  type Result,
  type TimeZoneId,
} from '@upkeep/domain';
import { auditEvent, found, transact, type Deps } from './deps';

export interface SetReminderInput {
  readonly activityId: ActivityId;
  /** 0 is the day itself. */
  readonly leadDays: number;
  /** "HH:MM" */
  readonly atTime: string;
  readonly enabled: boolean;
}

/**
 * Sets the reminder for an activity: creates it, or replaces its timing. Turning
 * it off keeps the record (disabled), so the choice survives and can be undone.
 */
export async function setActivityReminder(
  deps: Deps,
  input: SetReminderInput,
): Promise<Result<Reminder>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const activity = found(
      'Activity',
      input.activityId,
      await repos.activities.getById(input.activityId),
    );
    if (!activity.ok) return activity;

    const [existing] = await repos.reminders.list({ activityId: input.activityId });
    const checked = createReminder({
      id: existing?.id ?? deps.ids.next<'Reminder'>(),
      ownerId: deps.ownerId,
      now,
      activityId: input.activityId,
      leadDays: input.leadDays,
      atTime: input.atTime,
      enabled: input.enabled,
    });
    if (!checked.ok) return checked;

    const reminder: Reminder = existing
      ? { ...checked.value, meta: touch(existing.meta, now) }
      : checked.value;
    await repos.reminders.save(reminder);
    await repos.audit.add(
      auditEvent(
        deps,
        'reminder',
        reminder.id,
        existing ? 'updated' : 'created',
        activity.value.name,
      ),
    );
    return ok(reminder);
  });
}

/** The activity's reminder, if it has ever had one (it may be switched off). */
export async function getActivityReminder(
  repos: Repositories,
  activityId: ActivityId,
): Promise<Reminder | null> {
  return (await repos.reminders.list({ activityId }))[0] ?? null;
}

export interface ReminderItem {
  readonly reminder: Reminder;
  readonly occurrence: Occurrence;
  readonly activity: Activity;
  /** When the reminder fires (or fired). */
  readonly fireAt: Instant;
  /** The date the work is due, after any snooze. */
  readonly dueOn: LocalDate;
  /** Negative once overdue. */
  readonly daysUntilDue: number;
}

export interface ReminderStatus {
  /** Reminders whose time has come for work that is still outstanding, soonest due first. */
  readonly fired: readonly ReminderItem[];
  /** The next reminder still to come, if any. */
  readonly next?: ReminderItem | undefined;
}

export interface ReminderOptions {
  readonly now: Instant;
  /** The zone whose wall clock "09:00" refers to: the person's own. */
  readonly timeZone: TimeZoneId;
}

async function computeItems(
  repos: Repositories,
  options: ReminderOptions,
): Promise<ReminderItem[]> {
  const [reminders, activities, outstanding] = await Promise.all([
    repos.reminders.list(),
    repos.activities.list({ includeArchived: false }),
    repos.occurrences.list({ status: ['pending', 'snoozed'] }),
  ]);
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const today = localDateOf(options.now, options.timeZone);

  const items: ReminderItem[] = [];
  for (const reminder of reminders) {
    const activity = activityById.get(reminder.activityId);
    if (!reminder.enabled || !activity) continue;
    for (const occurrence of outstanding.filter((o) => o.activityId === reminder.activityId)) {
      const dueOn = effectiveDueOn(occurrence);
      items.push({
        reminder,
        occurrence,
        activity,
        fireAt: reminderFireTime(reminder, occurrence, options.timeZone),
        dueOn,
        daysUntilDue: daysBetween(today, dueOn),
      });
    }
  }
  return items;
}

const byDue = (a: ReminderItem, b: ReminderItem): number =>
  a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : a.activity.name.localeCompare(b.activity.name);

/**
 * What the person should be reminded about right now. Pure reading of what is
 * outstanding and when each reminder fires; nothing is stored, so it is always
 * correct after the app has been closed for any length of time (spec 11).
 */
export async function getReminderStatus(
  repos: Repositories,
  options: ReminderOptions,
): Promise<ReminderStatus> {
  const items = await computeItems(repos, options);
  const now = Date.parse(options.now);
  const fired = items.filter((i) => Date.parse(i.fireAt) <= now).sort(byDue);
  const upcoming = items
    .filter((i) => Date.parse(i.fireAt) > now)
    .sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt));
  return { fired, next: upcoming[0] };
}

/** What a delivery channel (a browser notification, say) is asked to show. */
export interface ReminderBatch {
  readonly items: readonly ReminderItem[];
}

export interface DeliverOptions extends ReminderOptions {
  /**
   * Shows the reminders. Return true if they were shown. Returning false (for
   * example when notification permission is missing) leaves them undelivered,
   * so they are offered again next time.
   */
  readonly deliver: (batch: ReminderBatch) => Promise<boolean>;
}

/**
 * Delivers reminders that have come due and have not been delivered yet, in one
 * batch so several at once become one notification, then records them as
 * delivered. Safe to run as often as you like: nothing is delivered twice.
 * Snoozing moves the due date, which makes the reminder due again.
 */
export async function deliverDueReminders(
  deps: Deps,
  options: DeliverOptions,
): Promise<Result<{ delivered: number }>> {
  const pending = await transact(deps, async (repos) => {
    const [status, done] = await Promise.all([
      getReminderStatus(repos, options),
      repos.reminderDeliveries.keys(),
    ]);
    return ok(
      status.fired.filter((i) => !done.has(deliveryKey(i.reminder.id, i.occurrence.id, i.dueOn))),
    );
  });
  if (!pending.ok) return pending;
  if (pending.value.length === 0) return ok({ delivered: 0 });

  // The channel runs outside the database transaction: it is slow and can fail.
  const shown = await Promise.resolve()
    .then(() => options.deliver({ items: pending.value }))
    .catch(() => false);
  if (!shown) return ok({ delivered: 0 });

  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const done = await repos.reminderDeliveries.keys();
    let delivered = 0;
    for (const i of pending.value) {
      const key = deliveryKey(i.reminder.id, i.occurrence.id, i.dueOn);
      if (done.has(key)) continue;
      await repos.reminderDeliveries.add({
        id: deps.ids.next<'ReminderDelivery'>(),
        meta: newMeta(deps.ownerId, now),
        reminderId: i.reminder.id,
        occurrenceId: i.occurrence.id,
        dueOn: i.dueOn,
        deliveredAt: now,
      });
      delivered += 1;
    }
    return ok({ delivered });
  });
}
