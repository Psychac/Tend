import { Link } from 'react-router';
import { getDashboard, type OccurrenceItem } from '@tend/application';
import { localDateOf, type LocalDate } from '@tend/domain';
import { deviceTimeZone, formatDate, useLiveQuery } from '../../shared/hooks';
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'brand' | 'info';
}) {
  const color = value === 0 ? 'text-faint' : { danger: 'text-danger', brand: 'text-brand', info: 'text-info' }[tone];
  return (
    <div className="card text-center" aria-hidden="true">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs font-medium text-muted">{label}</p>
    </div>
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
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Overdue" value={d.overdue.length} tone="danger" />
        <Stat label="Due today" value={d.dueToday.length} tone="brand" />
        <Stat label="Coming up" value={d.upcoming.length} tone="info" />
      </div>

      <RemindersPanel />

      {nothingOpen ? (
        <p className="card border-dashed py-8 text-center text-muted">
          Nothing is due.{' '}
          <Link to="/activities/new" className="font-medium text-brand underline">
            Add an activity
          </Link>{' '}
          to start keeping things up.
        </p>
      ) : null}

      <Section title="Overdue" items={d.overdue} today={d.today} />
      <Section title="Due today" items={d.dueToday} today={d.today} />
      <Section title="Coming up" items={d.upcoming} today={d.today} />

      {d.recentCompletions.length > 0 ? (
        <section aria-labelledby="h-recent" className="space-y-2">
          <h3
            id="h-recent"
            className="text-xs font-semibold uppercase tracking-wider text-muted"
          >
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
