import { err, invariantError, ok, type ActivityId, type AssetId, type Result } from '@tend/domain';
import { auditEvent, found, transact, type Deps } from './deps';

/** Statuses that record something that happened, so an activity that has them keeps its history. */
const HISTORY = ['completed', 'skipped', 'missed', 'cancelled'] as const;

/**
 * Permanently removes an activity that was never done: its open items, schedules, reminder and
 * attached files go with it. Anything with history (a completion, a skip, a cancel, a missed
 * item, a reading) is refused, because History, Insights and spending would stop adding up.
 * Archive those instead.
 */
export async function deleteActivity(
  deps: Deps,
  input: { activityId: ActivityId },
): Promise<Result<void>> {
  const attachmentIds: string[] = [];
  const result = await transact(deps, async (repos) => {
    const activity = found(
      'Activity',
      input.activityId,
      await repos.activities.getById(input.activityId),
    );
    if (!activity.ok) return activity;
    const id = input.activityId;

    const [done] = await repos.completions.list({ activityId: id, limit: 1 });
    const past = await repos.occurrences.list({ activityId: id, status: HISTORY, limit: 1 });
    const readings = await repos.measurements.list({ activityId: id, limit: 1 });
    if (done || past.length > 0 || readings.length > 0) {
      return err(
        invariantError('This activity has history, so it can only be archived, not deleted'),
      );
    }
    for (const s of await repos.schedules.list()) {
      if (s.strategy.kind === 'event' && s.strategy.afterActivityId === id) {
        return err(invariantError('Another activity follows this one. Change that one first'));
      }
    }

    for (const o of await repos.occurrences.list({ activityId: id })) {
      await repos.occurrences.delete(o.id);
    }
    for (const s of await repos.schedules.listForActivity(id)) await repos.schedules.delete(s.id);
    for (const r of await repos.reminders.list({ activityId: id })) {
      await repos.reminders.delete(r.id);
    }
    for (const a of await repos.attachments.listBySubject({ type: 'activity', id })) {
      attachmentIds.push(a.id);
      await repos.attachments.delete(a.id);
    }
    await repos.activities.delete(id);
    await repos.audit.add(auditEvent(deps, 'activity', id, 'deleted', activity.value.name));
    return ok(undefined);
  });
  if (result.ok) {
    for (const f of attachmentIds) await deps.files.remove(f as never).catch(() => undefined);
  }
  return result;
}

/** Removes an asset that nothing refers to: no activities, readings or attached files. */
export async function deleteAsset(deps: Deps, input: { assetId: AssetId }): Promise<Result<void>> {
  return transact(deps, async (repos) => {
    const asset = found('Asset', input.assetId, await repos.assets.getById(input.assetId));
    if (!asset.ok) return asset;
    const id = input.assetId;
    const used = (await repos.activities.list({ includeArchived: true })).filter(
      (a) => a.assetId === id,
    ).length;
    if (used > 0) {
      return err(
        invariantError(
          `${used} ${used === 1 ? 'activity uses' : 'activities use'} this asset. Delete or move them first, or retire the asset instead`,
        ),
      );
    }
    if ((await repos.measurements.list({ assetId: id, limit: 1 })).length > 0) {
      return err(invariantError('This asset has readings, so retire it instead of deleting it'));
    }
    if ((await repos.attachments.listBySubject({ type: 'asset', id })).length > 0) {
      return err(invariantError('Remove its attached files first, or retire the asset instead'));
    }
    await repos.assets.delete(id);
    await repos.audit.add(auditEvent(deps, 'asset', id, 'deleted', asset.value.name));
    return ok(undefined);
  });
}
