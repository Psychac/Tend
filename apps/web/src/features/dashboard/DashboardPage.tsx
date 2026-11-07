import { Link } from 'react-router';
import { getAssetAlerts, getDashboard, type OccurrenceItem } from '@tend/application';
import { localDateOf, type LocalDate } from '@tend/domain';
import { useApp } from '../../app/providers/AppProvider';
import { deviceTimeZone, formatDate, useLiveQuery } from '../../shared/hooks';
import { SyncIndicator } from '../../shared/ui/SyncIndicator';
import { RemindersPanel } from '../reminders/RemindersPanel';
import { OccurrenceCard } from './OccurrenceCard';

function Section({
  title,
  items,
  today,
}: {
  title: string;
  items: readonly OccurrenceItem[];
  today: LocalDate;
}) {
  if (items.length === 0) return null;
  const headingId = `section-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-xs font-semibold uppercase tracking-wider text-muted">
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <OccurrenceCard key={item.occurrence.id} item={item} today={today} />
        ))}
      </ul>
    </section>
  );
}

const STARTERS = [
  { label: 'Home upkeep', hint: 'Rooms, seasonal chores', to: '/household' },
  { label: 'Subscriptions', hint: 'Renewals and bills', to: '/activities/new?preset=subscription' },
  { label: 'Health', hint: 'Check-ups', to: '/activities/new?preset=health-checkup' },
  { label: 'Documents', hint: 'Passport, licence, papers', to: '/activities/new?preset=documents' },
  { label: 'Car or appliances', hint: 'Track an asset and its service', to: '/assets' },
  { label: 'Back up my data', hint: 'A regular reminder', to: '/activities/new?preset=backup' },
] as const;

/** Shown to someone with nothing yet: a few common places to begin, each opening a ready-made form. */
function StarterPicker() {
  return (
    <section aria-labelledby="h-start" className="space-y-3">
      <div>
        <h3 id="h-start" className="text-lg font-medium">
          What do you want to keep up?
        </h3>
        <p className="text-sm text-muted">
          Pick one to start from a ready-made reminder. You can change everything before saving.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <li key={s.label}>
            <Link to={s.to} className="card block p-3 hover:border-brand">
              <span className="font-medium">{s.label}</span>
              <span className="block text-sm text-muted">{s.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">
        Or{' '}
        <Link to="/activities/new" className="font-medium text-brand underline">
          start from scratch
        </Link>
        .
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'brand' | 'info';
}) {
  const color =
    value === 0
      ? 'text-faint'
      : { danger: 'text-danger', brand: 'text-brand', info: 'text-info' }[tone];
  return (
    <div className="card flex flex-col text-center">
      <dt className="order-2 text-xs font-medium text-muted">{label}</dt>
      <dd className={`order-1 text-2xl font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

/** Warranty, replacement, usage and servicing alerts for assets. Hidden when there are none. */
function AssetAlerts() {
  const { deps } = useApp();
  const alerts = useLiveQuery(({ repos }) =>
    getAssetAlerts(repos, {
      today: localDateOf(deps.clock.now(), deviceTimeZone()),
      timeZone: deviceTimeZone(),
    }),
  );
  if (alerts.status !== 'ready' || alerts.data.length === 0) return null;
  return (
    <section aria-labelledby="h-attention" className="space-y-2">
      <h3 id="h-attention" className="text-xs font-semibold uppercase tracking-wider text-muted">
        Needs attention
      </h3>
      <ul className="card divide-y divide-line py-1 text-sm">
        {alerts.data.map((a) => (
          <li key={`${a.kind}:${a.assetId}:${a.message}`} className="flex flex-wrap gap-x-2 py-2">
            <Link to="/assets" className="font-medium underline">
              {a.assetName}
            </Link>
            <span className="text-muted">{a.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DashboardPage() {
  const dashboard = useLiveQuery(
    ({ repos, deps }) => getDashboard(repos, deps.clock, { timeZone: deviceTimeZone() }),
    'dashboard',
  );

  if (dashboard.status === 'loading') return <p className="text-muted">Loading…</p>;
  if (dashboard.status === 'error') {
    return (
      <p role="alert" className="text-danger">
        Could not load your dashboard: {dashboard.message}
      </p>
    );
  }

  const d = dashboard.data;
  const nothingOpen = d.overdue.length + d.dueToday.length + d.upcoming.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <p className="mt-0.5 text-sm text-muted">{formatDate(d.today)}</p>
        <SyncIndicator showDetail className="mt-2" />
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Overdue" value={d.overdue.length} tone="danger" />
        <Stat label="Due today" value={d.dueToday.length} tone="brand" />
        <Stat label="Coming up" value={d.upcoming.length} tone="info" />
      </dl>

      <RemindersPanel />

      <AssetAlerts />

      {nothingOpen && d.recentCompletions.length === 0 ? (
        <StarterPicker />
      ) : nothingOpen ? (
        <p className="card border-dashed py-8 text-center text-muted">
          Nothing is due.{' '}
          <Link to="/activities/new" className="font-medium text-brand underline">
            Add an activity
          </Link>{' '}
          to keep more things up.
        </p>
      ) : null}

      <Section title="Overdue" items={d.overdue} today={d.today} />
      <Section title="Due today" items={d.dueToday} today={d.today} />
      <Section title="Coming up" items={d.upcoming} today={d.today} />

      {d.recentCompletions.length > 0 ? (
        <section aria-labelledby="h-recent" className="space-y-2">
          <h3 id="h-recent" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Recently done
          </h3>
          <ul className="card divide-y divide-line py-1 text-sm">
            {d.recentCompletions.map(({ completion, activityName }) => (
              <li key={completion.id} className="flex justify-between gap-3 py-2">
                {activityName}{' '}
                <span className="text-muted">
                  on {formatDate(localDateOf(completion.completedAt, deviceTimeZone()))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
