import { Link } from 'react-router';
import { getDashboard, type OccurrenceItem } from '@upkeep/application';
import { localDateOf, type LocalDate } from '@upkeep/domain';
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
      <h3 id={headingId} className="text-sm font-semibold uppercase tracking-wide text-slate-600">
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

export function DashboardPage() {
  const dashboard = useLiveQuery(
    ({ repos, deps }) => getDashboard(repos, deps.clock, { timeZone: deviceTimeZone() }),
    'dashboard',
  );

  if (dashboard.status === 'loading') return <p className="text-slate-600">Loading…</p>;
  if (dashboard.status === 'error') {
    return (
      <p role="alert" className="text-red-700">
        Could not load your dashboard: {dashboard.message}
      </p>
    );
  }

  const d = dashboard.data;
  const nothingOpen = d.overdue.length + d.dueToday.length + d.upcoming.length === 0;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Dashboard</h2>

      <RemindersPanel />

      {nothingOpen ? (
        <p className="rounded border border-dashed border-slate-300 bg-white p-4 text-slate-700">
          Nothing is due.{' '}
          <Link to="/activities/new" className="font-medium underline">
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
            className="text-sm font-semibold uppercase tracking-wide text-slate-600"
          >
            Recently done
          </h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {d.recentCompletions.map(({ completion, activityName }) => (
              <li key={completion.id}>
                {activityName}{' '}
                <span className="text-slate-500">
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
