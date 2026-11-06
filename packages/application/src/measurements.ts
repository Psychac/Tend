import type { Repositories } from '@tend/contracts';
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

export interface MeasurementPoint {
  readonly id: Measurement['id'];
  readonly measuredAt: Measurement['measuredAt'];
  /** The number for a numeric series; the label's position is not meaningful. */
  readonly value?: number | undefined;
  /** The rating or label for a qualitative series. */
  readonly label?: string | undefined;
  /** True when it was recorded as part of completing an activity. */
  readonly withService: boolean;
}

export interface MeasurementSeries {
  readonly key: string;
  readonly kind: 'numeric' | 'qualitative';
  /** Numeric series only. A key recorded in several units uses the newest unit. */
  readonly unit?: string | undefined;
  /** Oldest first, ready to plot or list. */
  readonly points: readonly MeasurementPoint[];
}

/**
 * Everything recorded for an asset, grouped by what was measured. A key that was recorded
 * both as a number and as a rating gives one series of each kind. Series are ordered by
 * their most recent entry, newest first.
 */
export async function getAssetMeasurementHistory(
  repos: Repositories,
  assetId: AssetId,
): Promise<MeasurementSeries[]> {
  // Newest first from the repository.
  const all = await repos.measurements.list({ assetId, limit: 2000 });
  const groups = new Map<string, Measurement[]>();
  for (const m of all) {
    const id = `${m.value.kind}:${m.key}`;
    groups.set(id, [...(groups.get(id) ?? []), m]);
  }
  return [...groups.values()].map((newestFirst) => {
    const first = newestFirst[0]!;
    const numeric = first.value.kind === 'numeric';
    return {
      key: first.key,
      kind: numeric ? 'numeric' : 'qualitative',
      unit: first.value.kind === 'numeric' ? first.value.quantity.unit : undefined,
      points: [...newestFirst].reverse().map((m) => ({
        id: m.id,
        measuredAt: m.measuredAt,
        value: m.value.kind === 'numeric' ? m.value.quantity.value : undefined,
        label: m.value.kind === 'qualitative' ? m.value.label : undefined,
        withService: m.completionId !== undefined,
      })),
    };
  });
}
