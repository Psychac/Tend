import {
  createActivity as createActivityEntity,
  createAsset as createAssetEntity,
  createSchedule,
  err,
  invariantError,
  localDateOf,
  missingDueDates,
  notFoundError,
  ok,
  parseLocalDate,
  planScheduleChange,
  touch,
  validationError,
  type Activity,
  type ActivityId,
  type ActivityType,
  type Asset,
  type AssetId,
  type CategoryId,
  type LocalDate,
  type LocationId,
  type MeasurementRequirement,
  type Money,
  type Priority,
  type Result,
  type Schedule,
} from '@upkeep/domain';
import { parseScheduleDates, type ScheduleInput } from './activities';
import { auditEvent, found, transact, type Deps } from './deps';
import { ensureOccurrences, lastResolvedOn, usageReading } from './generation';

export interface ChecklistEdit {
  /** Present for an existing item, so past completions keep pointing at it. */
  readonly id?: string | undefined;
  readonly label: string;
}

/** The full new state of an activity's descriptive details; schedules are edited separately. */
export interface UpdateActivityInput {
  readonly activityId: ActivityId;
  readonly name: string;
  readonly description?: string | undefined;
  readonly type: ActivityType;
  readonly priority?: Priority | undefined;
  readonly estimatedMinutes?: number | undefined;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly assetId?: AssetId | undefined;
  readonly checklist?: readonly ChecklistEdit[] | undefined;
  readonly measurementRequirements?: readonly MeasurementRequirement[] | undefined;
}

export async function updateActivity(
  deps: Deps,
  input: UpdateActivityInput,
): Promise<Result<Activity>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const loaded = found(
      'Activity',
      input.activityId,
      await repos.activities.getById(input.activityId),
    );
    if (!loaded.ok) return loaded;
    const existing = loaded.value;

    if (input.categoryId && !(await repos.categories.getById(input.categoryId))) {
      return err(notFoundError('Category', input.categoryId));
    }
    if (input.locationId && !(await repos.locations.getById(input.locationId))) {
      return err(notFoundError('Location', input.locationId));
    }
    if (input.assetId && !(await repos.assets.getById(input.assetId))) {
      return err(notFoundError('Asset', input.assetId));
    }

    const knownIds = new Set(existing.checklist.map((c) => c.id as string));
    const validated = createActivityEntity({
      id: existing.id,
      ownerId: existing.meta.ownerId,
      now,
      name: input.name,
      description: input.description,
      type: input.type,
      categoryId: input.categoryId,
      locationId: input.locationId,
      assetId: input.assetId,
      priority: input.priority,
      estimatedMinutes: input.estimatedMinutes,
      checklist: (input.checklist ?? []).map((c) => ({
        id: (c.id !== undefined && knownIds.has(c.id)
          ? c.id
          : deps.ids.next<'ChecklistItem'>()) as Activity['checklist'][number]['id'],
        label: c.label,
      })),
      measurementRequirements: input.measurementRequirements,
    });
    if (!validated.ok) return validated;

    // Validation ran on a fresh entity; carry over what edits must not change.
    const updated: Activity = {
      ...validated.value,
      meta: touch(existing.meta, now),
      archivedAt: existing.archivedAt,
    };
    await repos.activities.save(updated);
    await repos.audit.add(auditEvent(deps, 'activity', updated.id, 'updated', updated.name));
    return ok(updated);
  });
}

/** Brings an archived activity back and refills its upcoming schedule. */
export async function unarchiveActivity(
  deps: Deps,
  input: { activityId: ActivityId },
): Promise<Result<Activity>> {
  return transact(deps, async (repos) => {
    const loaded = found(
      'Activity',
      input.activityId,
      await repos.activities.getById(input.activityId),
    );
    if (!loaded.ok) return loaded;
    if (loaded.value.archivedAt === undefined) {
      return err(invariantError('Activity is not archived'));
    }
    const restored: Activity = {
      ...loaded.value,
      meta: touch(loaded.value.meta, deps.clock.now()),
      archivedAt: undefined,
    };
    await repos.activities.save(restored);
    for (const schedule of await repos.schedules.list()) {
      if (schedule.activityId === restored.id) {
        await ensureOccurrences(deps, repos, restored, schedule);
      }
    }
    await repos.audit.add(auditEvent(deps, 'activity', restored.id, 'restored', restored.name));
    return ok(restored);
  });
}

/**
 * What happens to upcoming work already created when a schedule changes
 * (spec 6.5): keep it as it is, or replace what the new schedule would not
 * produce. Overdue work is real and is always kept; completed history never changes.
 */
export type OutstandingPolicy = 'keep_outstanding' | 'supersede_future';

export interface SetScheduleInput {
  readonly activityId: ActivityId;
  readonly schedule: ScheduleInput;
  readonly outstanding?: OutstandingPolicy | undefined;
}

/** Gives an activity a schedule, or changes its existing one. */
export async function setActivitySchedule(
  deps: Deps,
  input: SetScheduleInput,
): Promise<Result<{ schedule: Schedule; created: number; superseded: number }>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const activity = found(
      'Activity',
      input.activityId,
      await repos.activities.getById(input.activityId),
    );
    if (!activity.ok) return activity;
    if (activity.value.archivedAt !== undefined) {
      return err(invariantError('Restore the activity before changing its schedule'));
    }
    const dates = parseScheduleDates(input.schedule);
    if (!dates.ok) return dates;

    const existing = (await repos.schedules.list()).find((s) => s.activityId === input.activityId);
    const built = createSchedule({
      id: existing?.id ?? deps.ids.next<'Schedule'>(),
      ownerId: deps.ownerId,
      now,
      activityId: input.activityId,
      strategy: input.schedule.strategy,
      policy: { graceDays: input.schedule.graceDays ?? 0 },
      timeZone: dates.value.timeZone,
      startsOn: dates.value.startsOn,
      endsOn: dates.value.endsOn,
    });
    if (!built.ok) return built;
    const schedule: Schedule = existing
      ? { ...built.value, meta: touch(existing.meta, now), pausedAt: existing.pausedAt }
      : built.value;

    await repos.schedules.save(schedule);

    let superseded = 0;
    if (existing && (input.outstanding ?? 'supersede_future') === 'supersede_future') {
      const today = localDateOf(now, schedule.timeZone);
      const outstanding = await repos.occurrences.list({
        activityId: input.activityId,
        status: ['pending', 'snoozed'],
      });
      const wanted: LocalDate[] = missingDueDates(schedule, {
        today,
        existingDueDates: [],
        lastResolvedOn:
          schedule.strategy.kind === 'completion_interval'
            ? await lastResolvedOn(repos, schedule)
            : undefined,
        usage:
          schedule.strategy.kind === 'usage'
            ? await usageReading(repos, activity.value, schedule.strategy.meterKey)
            : undefined,
      });
      const plan = planScheduleChange(outstanding, wanted, 'supersede_future', today, now);
      for (const o of plan.superseded) await repos.occurrences.save(o);
      superseded = plan.superseded.length;
    }
    const created = await ensureOccurrences(deps, repos, activity.value, schedule);
    await repos.audit.add(
      auditEvent(deps, 'schedule', schedule.id, existing ? 'updated' : 'created', 'schedule'),
    );
    return ok({ schedule, created: created.length, superseded });
  });
}

export interface UpdateAssetInput {
  readonly assetId: AssetId;
  readonly name: string;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly notes?: string | undefined;
  readonly vendor?: string | undefined;
  readonly purchaseDate?: string | undefined;
  readonly purchasePrice?: Money | undefined;
  readonly warrantyExpiresOn?: string | undefined;
}

/** Replaces an asset's descriptive details. Status changes go through `setAssetStatus`. */
export async function updateAsset(deps: Deps, input: UpdateAssetInput): Promise<Result<Asset>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const loaded = found('Asset', input.assetId, await repos.assets.getById(input.assetId));
    if (!loaded.ok) return loaded;
    const existing = loaded.value;

    const date = (path: string, raw: string | undefined): Result<LocalDate | undefined> => {
      if (raw === undefined || raw === '') return ok(undefined);
      const parsed = parseLocalDate(raw);
      return parsed.ok
        ? ok(parsed.value)
        : err(validationError([{ path, message: 'must be a valid date (YYYY-MM-DD)' }]));
    };
    const purchaseDate = date('purchaseDate', input.purchaseDate);
    if (!purchaseDate.ok) return purchaseDate;
    const warranty = date('warrantyExpiresOn', input.warrantyExpiresOn);
    if (!warranty.ok) return warranty;

    if (input.categoryId && !(await repos.categories.getById(input.categoryId))) {
      return err(notFoundError('Category', input.categoryId));
    }
    if (input.locationId && !(await repos.locations.getById(input.locationId))) {
      return err(notFoundError('Location', input.locationId));
    }

    const validated = createAssetEntity({
      id: existing.id,
      ownerId: existing.meta.ownerId,
      now,
      name: input.name,
      categoryId: input.categoryId,
      locationId: input.locationId,
      status: existing.status,
      purchase: {
        date: purchaseDate.value,
        price: input.purchasePrice,
        vendor: input.vendor?.trim() || undefined,
      },
      warranty: warranty.value ? { expiresOn: warranty.value } : undefined,
      notes: input.notes,
    });
    if (!validated.ok) return validated;

    const updated: Asset = { ...validated.value, meta: touch(existing.meta, now) };
    await repos.assets.save(updated);
    await repos.audit.add(auditEvent(deps, 'asset', updated.id, 'updated', updated.name));
    return ok(updated);
  });
}
