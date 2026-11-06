import {
  createMeasurement,
  err,
  ok,
  parseInstant,
  quantity,
  validationError,
  type ActivityId,
  type AssetId,
  type Measurement,
  type MeasurementValue,
  type Occurrence,
  type Result,
} from '@tend/domain';
import { found, transact, type Deps } from './deps';
import { ensureOccurrences, triggerConditionSchedules } from './generation';
import type { MeasurementInput } from './occurrences';

export interface RecordMeasurementInput {
  readonly measurement: MeasurementInput;
  readonly assetId?: AssetId | undefined;
  readonly activityId?: ActivityId | undefined;
  readonly measuredAt?: string | undefined;
}

/**
 * Records a standalone measurement (e.g. an odometer reading). Any usage-based
 * schedule watching that meter on the same subject may become due as a result.
 */
export async function recordMeasurement(
  deps: Deps,
  input: RecordMeasurementInput,
): Promise<Result<{ measurement: Measurement; createdOccurrences: readonly Occurrence[] }>> {
  return transact(deps, async (repos) => {
    const now = deps.clock.now();
    const m = input.measurement;

    let value: MeasurementValue;
    if (m.kind === 'qualitative') {
      value = { kind: 'qualitative', label: m.label };
    } else {
      const q = quantity(m.value, m.unit);
      if (!q.ok) return q;
      value = { kind: 'numeric', quantity: q.value };
    }

    let measuredAt;
    if (input.measuredAt !== undefined) {
      const parsed = parseInstant(input.measuredAt);
      if (!parsed.ok) {
        return err(
          validationError([{ path: 'measuredAt', message: 'must be an ISO-8601 UTC timestamp' }]),
        );
      }
      measuredAt = parsed.value;
    }

    if (input.assetId) {
      const asset = found('Asset', input.assetId, await repos.assets.getById(input.assetId));
      if (!asset.ok) return asset;
    }

    const created = createMeasurement({
      id: deps.ids.next<'Measurement'>(),
      ownerId: deps.ownerId,
      now,
      key: m.key,
      value,
      measuredAt,
      assetId: input.assetId,
      activityId: input.activityId,
    });
    if (!created.ok) return created;
    await repos.measurements.add(created.value);

    const createdOccurrences: Occurrence[] = [];
    for (const schedule of await repos.schedules.list()) {
      if (schedule.strategy.kind !== 'usage' || schedule.strategy.meterKey !== m.key) continue;
      const activity = await repos.activities.getById(schedule.activityId);
      if (!activity) continue;
      const watches =
        (input.assetId !== undefined && activity.assetId === input.assetId) ||
        (input.activityId !== undefined && activity.id === input.activityId);
      if (watches) {
        createdOccurrences.push(...(await ensureOccurrences(deps, repos, activity, schedule)));
      }
    }
    createdOccurrences.push(...(await triggerConditionSchedules(deps, repos, created.value)));
    return ok({ measurement: created.value, createdOccurrences });
  });
}
