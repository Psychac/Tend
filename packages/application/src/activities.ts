import {
  createActivity as createActivityEntity,
  createSchedule,
  invariantError,
  notFoundError,
  err,
  ok,
  newMeta,
  parseLocalDate,
  rescheduleOccurrence as rescheduleOccurrenceEntity,
  parseTimeZone,
  touch,
  transitionOccurrence,
  validationError,
  type Activity,
  type ActivityId,
  type ActivityType,
  type AssetId,
  type CategoryId,
  type DomainError,
  type LocalDate,
  type LocationId,
  type MeasurementRequirement,
  type Occurrence,
  type Priority,
  type Result,
  type Schedule,
  type ScheduleStrategy,
  type TimeZoneId,
} from '@tend/domain';
import type { Repositories } from '@tend/contracts';
import { auditEvent, found, transact, type Deps } from './deps';
import { ensureOccurrences } from './generation';

export interface ScheduleInput {
  readonly strategy: ScheduleStrategy;
  readonly graceDays?: number | undefined;
  readonly timeZone: string;
  readonly startsOn: string;
  readonly endsOn?: string | undefined;
}

export interface CreateActivityInput {
  readonly name: string;
  readonly description?: string | undefined;
  readonly type: ActivityType;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly assetId?: AssetId | undefined;
  readonly priority?: Priority | undefined;
  readonly estimatedMinutes?: number | undefined;
  /** Checklist item labels; ids are assigned here. */
  readonly checklist?: readonly string[] | undefined;
  readonly measurementRequirements?: readonly MeasurementRequirement[] | undefined;
  readonly schedule?: ScheduleInput | undefined;
  /** For an activity that does not repeat: the day it is due. Left out, it is only planned. */
  readonly dueOn?: string | undefined;
}

export interface CreateActivityResult {
  readonly activity: Activity;
  readonly schedule?: Schedule | undefined;
  readonly occurrences: readonly Occurrence[];
}

export function parseScheduleDates(
  input: ScheduleInput,
): Result<{ startsOn: LocalDate; endsOn?: LocalDate; timeZone: TimeZoneId }, DomainError> {
  const timeZone = parseTimeZone(input.timeZone);
  if (!timeZone.ok) return err(prefixed('schedule.timeZone', timeZone.error));
  const startsOn = parseLocalDate(input.startsOn);
  if (!startsOn.ok) return err(prefixed('schedule.startsOn', startsOn.error));
  if (input.endsOn === undefined) {
    return ok({ startsOn: startsOn.value, timeZone: timeZone.value });
  }
  const endsOn = parseLocalDate(input.endsOn);
  if (!endsOn.ok) return err(prefixed('schedule.endsOn', endsOn.error));
  return ok({ startsOn: startsOn.value, endsOn: endsOn.value, timeZone: timeZone.value });
}

const prefixed = (path: string, e: DomainError): DomainError =>
  validationError([{ path, message: e.issues[0]?.message ?? e.message }]);

/**
 * Creates an activity and, if a schedule is supplied, the schedule and its
 * first batch of occurrences, all in one transaction.
 */
export async function createActivity(
  deps: Deps,
  input: CreateActivityInput,
): Promise<Result<CreateActivityResult>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();

    // Referenced records must exist (and belong to this user, by repository scoping).
    if (input.categoryId && !(await repos.categories.getById(input.categoryId))) {
      return err(notFoundError('Category', input.categoryId));
    }
    if (input.locationId && !(await repos.locations.getById(input.locationId))) {
      return err(notFoundError('Location', input.locationId));
    }
    if (input.assetId && !(await repos.assets.getById(input.assetId))) {
      return err(notFoundError('Asset', input.assetId));
    }

    const created = createActivityEntity({
      id: deps.ids.next<'Activity'>(),
      ownerId: deps.ownerId,
      now,
      name: input.name,
      description: input.description,
      type: input.type,
      categoryId: input.categoryId,
      locationId: input.locationId,
      assetId: input.assetId,
      priority: input.priority,
      estimatedMinutes: input.estimatedMinutes,
      checklist: (input.checklist ?? []).map((label) => ({
        id: deps.ids.next<'ChecklistItem'>(),
        label,
      })),
      measurementRequirements: input.measurementRequirements,
    });
    if (!created.ok) return created;
    const activity = created.value;

    if (input.dueOn !== undefined && input.schedule) {
      return err(
        validationError([
          { path: 'dueOn', message: 'is only for an activity that does not repeat' },
        ]),
      );
    }
    const dueOn = input.dueOn === undefined ? undefined : parseLocalDate(input.dueOn);
    if (dueOn && !dueOn.ok) {
      return err(validationError([{ path: 'dueOn', message: 'must be a YYYY-MM-DD date' }]));
    }

    let schedule: Schedule | undefined;
    if (input.schedule) {
      const st = input.schedule.strategy;
      if (st.kind === 'event' && !(await repos.activities.getById(st.afterActivityId))) {
        return err(notFoundError('Activity', st.afterActivityId));
      }
      const dates = parseScheduleDates(input.schedule);
      if (!dates.ok) return dates;
      const s = createSchedule({
        id: deps.ids.next<'Schedule'>(),
        ownerId: deps.ownerId,
        now,
        activityId: activity.id,
        strategy: input.schedule.strategy,
        policy: { graceDays: input.schedule.graceDays ?? 0 },
        timeZone: dates.value.timeZone,
        startsOn: dates.value.startsOn,
        endsOn: dates.value.endsOn,
      });
      if (!s.ok) return s;
      schedule = s.value;
    }

    await repos.activities.save(activity);
    await repos.audit.add(auditEvent(deps, 'activity', activity.id, 'created', activity.name));
    let occurrences: Occurrence[] = [];
    if (schedule) {
      await repos.schedules.save(schedule);
      occurrences = await ensureOccurrences(deps, repos, activity, schedule);
    } else if (dueOn?.ok) {
      occurrences = [await saveOneOffOccurrence(deps, repos, activity.id, dueOn.value)];
    }
    return ok({ activity, schedule, occurrences });
  });
}

async function saveOneOffOccurrence(
  deps: Deps,
  repos: Repositories,
  activityId: ActivityId,
  dueOn: LocalDate,
): Promise<Occurrence> {
  const occurrence: Occurrence = {
    id: deps.ids.next<'Occurrence'>(),
    meta: newMeta(deps.ownerId, deps.clock.now()),
    activityId,
    dueOn,
    status: 'pending',
  };
  await repos.occurrences.save(occurrence);
  return occurrence;
}

/**
 * Gives a planned activity (one that does not repeat) a due date, or moves the date it has.
 * It becomes a normal item on the Dashboard and Calendar from then on.
 */
export async function setActivityDueDate(
  deps: Deps,
  input: { activityId: ActivityId; dueOn: string },
): Promise<Result<Occurrence>> {
  return transact(deps, async (repos) => {
    const dueOn = parseLocalDate(input.dueOn);
    if (!dueOn.ok) {
      return err(validationError([{ path: 'dueOn', message: 'must be a YYYY-MM-DD date' }]));
    }
    const activity = found(
      'Activity',
      input.activityId,
      await repos.activities.getById(input.activityId),
    );
    if (!activity.ok) return activity;
    if (activity.value.archivedAt !== undefined) {
      return err(invariantError('Restore this activity before giving it a date'));
    }
    if ((await repos.schedules.listForActivity(input.activityId)).length > 0) {
      return err(invariantError('This activity repeats; change its schedule instead'));
    }
    const [open] = await repos.occurrences.list({
      activityId: input.activityId,
      status: ['pending', 'snoozed'],
      limit: 1,
    });
    if (open) {
      const moved = rescheduleOccurrenceEntity(open, dueOn.value, deps.clock.now());
      if (!moved.ok) return moved;
      await repos.occurrences.save(moved.value);
      return ok(moved.value);
    }
    const occurrence = await saveOneOffOccurrence(deps, repos, input.activityId, dueOn.value);
    await repos.audit.add(
      auditEvent(deps, 'activity', input.activityId, 'updated', `${activity.value.name}: dated`),
    );
    return ok(occurrence);
  });
}

/**
 * Archives an activity. Its outstanding occurrences are superseded rather
 * than deleted, and its completion history is untouched.
 */
export async function archiveActivity(
  deps: Deps,
  input: { activityId: ActivityId },
): Promise<Result<Activity>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const loaded = found(
      'Activity',
      input.activityId,
      await repos.activities.getById(input.activityId),
    );
    if (!loaded.ok) return loaded;
    if (loaded.value.archivedAt !== undefined) {
      return err(invariantError('Activity is already archived'));
    }

    const archived: Activity = {
      ...loaded.value,
      meta: touch(loaded.value.meta, now),
      archivedAt: now,
    };
    await repos.activities.save(archived);

    const outstanding = await repos.occurrences.list({
      activityId: archived.id,
      status: ['pending', 'snoozed'],
    });
    for (const o of outstanding) {
      const r = transitionOccurrence(o, 'superseded', now);
      if (r.ok) await repos.occurrences.save(r.value);
    }
    await repos.audit.add(auditEvent(deps, 'activity', archived.id, 'archived', archived.name));
    return ok(archived);
  });
}
