import { useState } from 'react';
import { getInsights, type InsightsView, type MonthInsight } from '@tend/application';
import { addDays, formatMoney, localDateOf, type LocalDate, type Money } from '@tend/domain';
import { useApp } from '../../app/providers/AppProvider';
import { deviceTimeZone, formatDate, useLiveQuery } from '../../shared/hooks';

type Range = '30' | '90' | '365' | 'all';

const RANGES: [Range, string][] = [
  ['30', 'Last 30 days'],
  ['90', 'Last 90 days'],
  ['365', 'Last 12 months'],
  ['all', 'All time'],
];

const spendText = (spend: readonly Money[]): string =>
  spend.length === 0 ? 'none' : spend.map((m) => formatMoney(m)).join(' · ');

const percent = (n: number): string => `${Math.round(n * 100)}%`;

export function InsightsPage() {
  const { deps } = useApp();
  const timeZone = deviceTimeZone();
  const today = localDateOf(deps.clock.now(), timeZone);
  const [range, setRange] = useState<Range>('90');

  const from: LocalDate | undefined = range === 'all' ? undefined : addDays(today, -Number(range));
  const insights = useLiveQuery(
    ({ repos }) => getInsights(repos, { from, today, timeZone }),
    `${range}|${today}`,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold">Insights</h2>
        <label className="text-sm">
          Period{' '}
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="field"
          >
            {RANGES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {insights.status === 'loading' ? <p className="text-muted">Loading…</p> : null}
      {insights.status === 'error' ? (
        <p role="alert" className="text-danger">
          {insights.message}
        </p>
      ) : null}
      {insights.status === 'ready' ? <Report view={insights.data} /> : null}
    </div>
  );
}

function Report({ view }: { view: InsightsView }) {
  if (view.completed + view.skipped === 0 && view.overdueNow === 0 && view.meters.length === 0) {
    return (
      <p className="text-muted">
        Nothing to summarise for this period yet. Complete some work and this page will show how
        reliably it gets done, what it costs, and how often.
      </p>
    );
  }

  return (
    <>
      <section aria-labelledby="summary-heading">
        <h3 id="summary-heading" className="sr-only">
          Summary
        </h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Done" value={String(view.completed)} />
          <Stat label="Skipped" value={String(view.skipped)} />
          <Stat
            label="Done on time"
            value={view.onTimeRate === undefined ? '–' : percent(view.onTimeRate)}
            note={
              view.averageDaysLate === undefined
                ? undefined
                : `late ones averaged ${view.averageDaysLate.toFixed(1)} days late`
            }
          />
          <Stat label="Overdue now" value={String(view.overdueNow)} />
        </dl>
      </section>

      <section aria-labelledby="spend-heading" className="space-y-2">
        <h3 id="spend-heading" className="text-lg font-medium">
          Spending
        </h3>
        {view.spend.length === 0 ? (
          <p className="text-muted">No costs recorded in this period.</p>
        ) : (
          <p>
            <span className="text-muted">Total: </span>
            <span className="font-medium">{spendText(view.spend)}</span>
          </p>
        )}
        {view.spend.length > 1 ? (
          <p className="text-sm text-muted">
            Costs were recorded in more than one currency, so they are shown separately rather than
            converted.
          </p>
        ) : null}
      </section>

      {view.months.length > 0 ? (
        <section aria-labelledby="months-heading" className="space-y-2">
          <h3 id="months-heading" className="text-lg font-medium">
            By month
          </h3>
          <Months months={view.months} />
        </section>
      ) : null}

      {view.categories.length > 0 ? (
        <section aria-labelledby="categories-heading" className="space-y-2">
          <h3 id="categories-heading" className="text-lg font-medium">
            By category
          </h3>
          <ul className="space-y-1 text-sm">
            {view.categories.map((c) => (
              <li key={c.name}>
                <span className="font-medium">{c.name}</span>: {c.completed} done
                {c.spend.length > 0 ? ` · ${spendText(c.spend)}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.activities.length > 0 ? (
        <section aria-labelledby="activities-heading" className="space-y-2">
          <h3 id="activities-heading" className="text-lg font-medium">
            By activity
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="py-1 pr-3 font-medium">Activity</th>
                  <th className="py-1 pr-3 font-medium">Done</th>
                  <th className="py-1 pr-3 font-medium">Skipped</th>
                  <th className="py-1 pr-3 font-medium">Last done</th>
                  <th className="py-1 pr-3 font-medium">Usually every</th>
                  <th className="py-1 font-medium">Spent</th>
                </tr>
              </thead>
              <tbody>
                {view.activities.map((a) => (
                  <tr key={a.activityId} className="border-b border-line">
                    <td className="py-1 pr-3">{a.name}</td>
                    <td className="pr-3">{a.completed}</td>
                    <td className="pr-3">{a.skipped}</td>
                    <td className="pr-3">{a.lastDoneOn ? formatDate(a.lastDoneOn) : '–'}</td>
                    <td className="pr-3">
                      {a.averageIntervalDays === undefined ? '–' : `${a.averageIntervalDays} days`}
                    </td>
                    <td>{a.spend.length === 0 ? '–' : spendText(a.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view.meters.length > 0 ? (
        <section aria-labelledby="meters-heading" className="space-y-2">
          <h3 id="meters-heading" className="text-lg font-medium">
            Meters
          </h3>
          <ul className="space-y-1 text-sm">
            {view.meters.map((m) => (
              <li key={`${m.assetId}|${m.key}`}>
                <span className="font-medium">
                  {m.assetName} {m.key}
                </span>
                : {m.first.value} → {m.last.value} {m.unit}
                {m.per30Days === undefined
                  ? ''
                  : ` (about ${Math.round(m.per30Days).toLocaleString()} ${m.unit} per 30 days)`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string | undefined }) {
  return (
    <div className="card p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
      {note ? <dd className="text-xs text-muted">{note}</dd> : null}
    </div>
  );
}

/** Bars are decoration; every number is also printed, so nothing depends on seeing the bar. */
function Months({ months }: { months: readonly MonthInsight[] }) {
  const peak = Math.max(1, ...months.map((m) => m.completed + m.skipped));
  const title = (month: string) =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return (
    <ul className="space-y-1">
      {months.map((m) => (
        <li key={m.month} className="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-sm">
          <span>{title(m.month)}</span>
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-3 overflow-hidden rounded bg-sunken"
              style={{ width: `${((m.completed + m.skipped) / peak) * 60 + 2}%` }}
            >
              <span
                className="bg-brand"
                style={{ width: `${(m.completed / Math.max(1, m.completed + m.skipped)) * 100}%` }}
              />
              <span className="flex-1 bg-faint" />
            </span>
            <span>
              {m.completed} done
              {m.skipped > 0 ? `, ${m.skipped} skipped` : ''}
              {m.spend.length > 0 ? ` · ${spendText(m.spend)}` : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
