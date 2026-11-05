import {
  createActivity as createActivityEntity,
  createSchedule,
  invariantError,
  notFoundError,
  err,
  ok,
  parseLocalDate,
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

    let schedule: Schedule | undefined;
    if (input.schedule) {
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
    }
    return ok({ activity, schedule, occurrences });
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
