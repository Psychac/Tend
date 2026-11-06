import type { Repositories } from '@tend/contracts';
import {
  addDays,
  addMonths,
  daysBetween,
  localDateOf,
  nextUsageThreshold,
  type Asset,
  type LocalDate,
  type TimeZoneId,
} from '@tend/domain';
import { listReplacementPlan } from './assets';
import { usageReading } from './generation';

export type AssetAlertKind =
  'warranty_expiring' | 'replace_soon' | 'usage_near' | 'no_recent_service';

export interface AssetAlert {
  readonly kind: AssetAlertKind;
  readonly assetId: Asset['id'];
  readonly assetName: string;
  /** A short sentence, for example "Warranty ends in 12 days". */
  readonly message: string;
  /** Orders alerts of the same kind; smaller is more pressing. */
  readonly urgency: number;
}

export interface AssetAlertOptions {
  readonly today: LocalDate;
  readonly timeZone: TimeZoneId;
  /** Warn this many days before a warranty ends. Default 60. */
  readonly warrantyDays?: number | undefined;
  /** Warn about replacement when it is due within this many days. Default 90. */
  readonly replaceDays?: number | undefined;
  /** Warn once a usage meter has used this share of its interval. Default 0.9. */
  readonly usageShare?: number | undefined;
  /** Flag an asset with activities but no completion for this many months. Default 12. */
  readonly serviceMonths?: number | undefined;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Things worth a look on the dashboard, derived on demand from assets, their activities and
 * readings. Nothing is stored, so there is nothing to dismiss or go stale (ADR-019).
 * Usage that is already due is not repeated here: it has its own occurrence.
 */
export async function getAssetAlerts(
  repos: Repositories,
  options: AssetAlertOptions,
): Promise<AssetAlert[]> {
  const { today, timeZone } = options;
  const warrantyHorizon = addDays(today, options.warrantyDays ?? 60);
  const share = options.usageShare ?? 0.9;
  const staleBefore = addMonths(today, -(options.serviceMonths ?? 12));

  const [assets, activities, schedules] = await Promise.all([
    repos.assets.list({}),
    repos.activities.list({}),
    repos.schedules.list(),
  ]);
  const live = assets.filter((a) => a.status === 'active' || a.status === 'in_storage');
  const alerts: AssetAlert[] = [];

  for (const asset of live) {
    const expiresOn = asset.warranty?.expiresOn;
    if (expiresOn && expiresOn >= today && expiresOn <= warrantyHorizon) {
      const days = daysBetween(today, expiresOn);
      alerts.push({
        kind: 'warranty_expiring',
        assetId: asset.id,
        assetName: asset.name,
        message:
          days === 0 ? 'Warranty ends today' : `Warranty ends in ${plural(days, 'day', 'days')}`,
        urgency: days,
      });
    }
  }

  const plan = await listReplacementPlan(repos, {
    today,
    withinDays: options.replaceDays ?? 90,
  });
  for (const item of plan) {
    const { replaceOn, reasons } = item;
    const parts: string[] = [];
    if (replaceOn && reasons.includes('overdue')) parts.push('past its expected life');
    else if (replaceOn && reasons.includes('due_soon')) {
      parts.push(
        `reaches its expected life in ${plural(daysBetween(today, replaceOn), 'day', 'days')}`,
      );
    }
    if (reasons.includes('poor_condition')) parts.push('in poor condition');
    if (parts.length === 0) continue;
    const text = parts.join(', ');
    alerts.push({
      kind: 'replace_soon',
      assetId: item.asset.id,
      assetName: item.asset.name,
      message: text.charAt(0).toUpperCase() + text.slice(1),
      urgency: replaceOn ? daysBetween(today, replaceOn) : 365,
    });
  }

  const liveIds = new Set(live.map((a) => a.id));
  const assetName = new Map(live.map((a) => [a.id, a.name]));
  for (const activity of activities) {
    if (activity.archivedAt !== undefined || !activity.assetId || !liveIds.has(activity.assetId)) {
      continue;
    }
    const schedule = schedules.find((s) => s.activityId === activity.id);
    if (!schedule || schedule.pausedAt !== undefined || schedule.strategy.kind !== 'usage') {
      continue;
    }
    const strategy = schedule.strategy;
    const reading = await usageReading(repos, activity, strategy.meterKey);
    if (!reading) continue;
    const used = reading.currentReading - reading.lastServiceReading;
    const left = nextUsageThreshold(strategy, reading.lastServiceReading) - reading.currentReading;
    if (left <= 0 || used / strategy.every.value < share) continue;
    alerts.push({
      kind: 'usage_near',
      assetId: activity.assetId,
      assetName: assetName.get(activity.assetId) ?? activity.name,
      message: `${activity.name} in ${Math.round(left * 100) / 100} ${strategy.every.unit}`,
      urgency: used / strategy.every.value > 1 ? 0 : Math.round(left),
    });
  }

  for (const asset of live) {
    if (localDateOf(asset.meta.createdAt, timeZone) > staleBefore) continue;
    const own = activities.filter((a) => a.assetId === asset.id && a.archivedAt === undefined);
    if (own.length === 0) continue;
    let latest: LocalDate | undefined;
    for (const activity of own) {
      const [last] = await repos.completions.list({ activityId: activity.id, limit: 1 });
      const on = last && localDateOf(last.completedAt, timeZone);
      if (on && (!latest || on > latest)) latest = on;
    }
    if (latest && latest > staleBefore) continue;
    alerts.push({
      kind: 'no_recent_service',
      assetId: asset.id,
      assetName: asset.name,
      message: latest
        ? `No maintenance recorded since ${latest}`
        : 'No maintenance has been recorded yet',
      urgency: latest ? -daysBetween(latest, today) : -10_000,
    });
  }

  const rank: Record<AssetAlertKind, number> = {
    warranty_expiring: 0,
    usage_near: 1,
    replace_soon: 2,
    no_recent_service: 3,
  };
  return alerts.sort(
    (a, b) =>
      rank[a.kind] - rank[b.kind] ||
      a.urgency - b.urgency ||
      a.assetName.localeCompare(b.assetName),
  );
}
