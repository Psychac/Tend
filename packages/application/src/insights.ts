import type { Repositories } from '@tend/contracts';
import {
  addDays,
  classifyOccurrence,
  daysBetween,
  localDateOf,
  startOfDayInstant,
  totalsByCurrency,
  type ActivityId,
  type AssetId,
  type LocalDate,
  type Money,
  type TimeZoneId,
} from '@tend/domain';

export interface InsightsOptions {
  /** Inclusive start; omit for everything on record. */
  readonly from?: LocalDate | undefined;
  readonly today: LocalDate;
  readonly timeZone: TimeZoneId;
}

export interface ActivityInsight {
  readonly activityId: ActivityId;
  readonly name: string;
  readonly completed: number;
  readonly skipped: number;
  readonly lastDoneOn?: LocalDate | undefined;
  /** Average whole days between consecutive completions; needs at least two. */
  readonly averageIntervalDays?: number | undefined;
  readonly spend: readonly Money[];
}

export interface CategoryInsight {
  /** "No category" for work whose activity has none. */
  readonly name: string;
  readonly completed: number;
  readonly spend: readonly Money[];
}

export interface MonthInsight {
  /** YYYY-MM */
  readonly month: string;
  readonly completed: number;
  readonly skipped: number;
  readonly spend: readonly Money[];
}

export interface MeterInsight {
  readonly assetId: AssetId;
  readonly assetName: string;
  readonly key: string;
  readonly unit: string;
  readonly first: { readonly value: number; readonly on: LocalDate };
  readonly last: { readonly value: number; readonly on: LocalDate };
  /** Average change per 30 days; needs two readings on different days. */
  readonly per30Days?: number | undefined;
}

export interface InsightsView {
  readonly completed: number;
  readonly skipped: number;
  /** Of completions that had a planned date: how many were done on or before it. */
  readonly onTime: number;
  readonly late: number;
  readonly onTimeRate?: number | undefined;
  /** Average days past the planned date, over late completions only. */
  readonly averageDaysLate?: number | undefined;
  readonly overdueNow: number;
  /** Totals per currency; different currencies are never added together. */
  readonly spend: readonly Money[];
  readonly months: readonly MonthInsight[];
  readonly activities: readonly ActivityInsight[];
  /** Empty unless some work belongs to a category. */
  readonly categories: readonly CategoryInsight[];
  readonly meters: readonly MeterInsight[];
}

const monthOf = (date: LocalDate): string => date.slice(0, 7);

/** Every month from `first` to `last`, so quiet months show as zero instead of vanishing. */
function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number) as [number, number];
  const [ly, lm] = last.split('-').map(Number) as [number, number];
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Plain-language summaries of what has been done: how reliably, how often,
 * what it cost, and how meters have moved. Derived from history on demand and
 * never stored, so it always agrees with the records.
 */
export async function getInsights(
  repos: Repositories,
  options: InsightsOptions,
): Promise<InsightsView> {
  const { from, today, timeZone } = options;
  const [activities, schedules, outstanding, skipped, completions, assets, readings, categoryList] =
    await Promise.all([
      repos.activities.list({ includeArchived: true }),
      repos.schedules.list(),
      repos.occurrences.list({ status: ['pending', 'snoozed'] }),
      repos.occurrences.list({ status: ['skipped'], dueFrom: from, dueTo: today }),
      repos.completions.list({
        from: from ? startOfDayInstant(from, timeZone) : undefined,
        to: startOfDayInstant(addDays(today, 1), timeZone),
      }),
      repos.assets.list({}),
      repos.measurements.list({ limit: 5000 }),
      repos.categories.list(),
    ]);
  const graceOf = new Map(schedules.map((s) => [s.id, s.policy.graceDays]));

  const done = completions
    .map((c) => ({ c, on: localDateOf(c.completedAt, timeZone) }))
    .filter(({ on }) => (!from || on >= from) && on <= today);

  const lateDays: number[] = [];
  let onTime = 0;
  for (const { c, on } of done) {
    if (!c.plannedFor) continue;
    const days = daysBetween(c.plannedFor, on);
    if (days <= 0) onTime += 1;
    else lateDays.push(days);
  }
  const planned = onTime + lateDays.length;

  const overdueNow = outstanding.filter(
    (o) =>
      activities.find((a) => a.id === o.activityId)?.archivedAt === undefined &&
      classifyOccurrence(o, (o.scheduleId ? graceOf.get(o.scheduleId) : 0) ?? 0, today) ===
        'overdue',
  ).length;

  const costs = done.flatMap(({ c }) => (c.cost ? [c.cost] : []));

  // Per month.
  const monthKeys = [
    ...done.map(({ on }) => monthOf(on)),
    ...skipped.map((o) => monthOf(o.dueOn)),
  ].sort();
  const months: MonthInsight[] = monthKeys.length
    ? monthsBetween(monthKeys[0]!, from ? monthOf(today) : (monthKeys.at(-1) as string)).map(
        (month) => ({
          month,
          completed: done.filter(({ on }) => monthOf(on) === month).length,
          skipped: skipped.filter((o) => monthOf(o.dueOn) === month).length,
          spend: totalsByCurrency(
            done.flatMap(({ c, on }) => (c.cost && monthOf(on) === month ? [c.cost] : [])),
          ),
        }),
      )
    : [];

  // Per activity.
  const perActivity: ActivityInsight[] = activities
    .map((a): ActivityInsight => {
      const mine = done
        .filter(({ c }) => c.activityId === a.id)
        .sort((x, y) => (x.on < y.on ? -1 : 1));
      const gaps = mine.slice(1).map((d, i) => daysBetween(mine[i]!.on, d.on));
      return {
        activityId: a.id,
        name: a.name,
        completed: mine.length,
        skipped: skipped.filter((o) => o.activityId === a.id).length,
        lastDoneOn: mine.at(-1)?.on,
        averageIntervalDays: gaps.length
          ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
          : undefined,
        spend: totalsByCurrency(mine.flatMap(({ c }) => (c.cost ? [c.cost] : []))),
      };
    })
    .filter((a) => a.completed + a.skipped > 0)
    .sort((a, b) => b.completed - a.completed || a.name.localeCompare(b.name));

  // Per category: only worth showing once something has been filed under one.
  const categoryOf = new Map(activities.map((a) => [a.id, a.categoryId]));
  const categoryNames = new Map(categoryList.map((c) => [c.id, c.name]));
  const byCategory = new Map<string, { completed: number; costs: Money[] }>();
  for (const { c } of done) {
    const id = categoryOf.get(c.activityId);
    const name = (id && categoryNames.get(id)) || 'No category';
    const entry = byCategory.get(name) ?? { completed: 0, costs: [] };
    entry.completed += 1;
    if (c.cost) entry.costs.push(c.cost);
    byCategory.set(name, entry);
  }
  const categories: CategoryInsight[] = [...byCategory]
    .map(([name, v]) => ({ name, completed: v.completed, spend: totalsByCurrency(v.costs) }))
    .sort(
      (a, b) =>
        (a.name === 'No category' ? 1 : 0) - (b.name === 'No category' ? 1 : 0) ||
        b.completed - a.completed ||
        a.name.localeCompare(b.name),
    );

  // Meters: first and last numeric reading per asset and key within the range.
  const assetName = new Map(assets.map((a) => [a.id, a.name]));
  const groups = new Map<
    string,
    { assetId: AssetId; key: string; unit: string; rows: { value: number; on: LocalDate }[] }
  >();
  for (const m of readings) {
    if (m.assetId === undefined || m.value.kind !== 'numeric') continue;
    const on = localDateOf(m.measuredAt, timeZone);
    if ((from && on < from) || on > today) continue;
    const id = `${m.assetId}|${m.key}`;
    const g = groups.get(id) ?? {
      assetId: m.assetId,
      key: m.key,
      unit: m.value.quantity.unit,
      rows: [],
    };
    g.rows.push({ value: m.value.quantity.value, on });
    groups.set(id, g);
  }
  const meters: MeterInsight[] = [...groups.values()]
    .map((g) => {
      const rows = g.rows.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
      const first = rows[0]!;
      const last = rows.at(-1)!;
      const span = daysBetween(first.on, last.on);
      return {
        assetId: g.assetId,
        assetName: assetName.get(g.assetId) ?? 'Deleted asset',
        key: g.key,
        unit: g.unit,
        first,
        last,
        per30Days: span > 0 ? ((last.value - first.value) / span) * 30 : undefined,
      };
    })
    .filter((m) => m.first.on !== m.last.on || m.first.value !== m.last.value)
    .sort((a, b) => a.assetName.localeCompare(b.assetName) || a.key.localeCompare(b.key));

  return {
    completed: done.length,
    skipped: skipped.length,
    onTime,
    late: lateDays.length,
    onTimeRate: planned > 0 ? onTime / planned : undefined,
    averageDaysLate: lateDays.length
      ? lateDays.reduce((s, d) => s + d, 0) / lateDays.length
      : undefined,
    overdueNow,
    spend: totalsByCurrency(costs),
    months,
    activities: perActivity,
    categories: categories.some((c) => c.name !== 'No category') ? categories : [],
    meters,
  };
}
