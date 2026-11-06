import { Link } from 'react-router';
import {
  DIGITAL_CATEGORY,
  DIGITAL_PRESETS,
  listActivities,
  listCategories,
} from '@tend/application';
import { formatDate, useLiveQuery } from '../../shared/hooks';

/** Digital upkeep: renewals, backups and reviews, listed by next due date. */
export function DigitalPage() {
  const items = useLiveQuery(async ({ repos }) => {
    const wanted = DIGITAL_CATEGORY.toLowerCase();
    const category = (await listCategories(repos)).find(
      (c) => c.category.name.trim().toLowerCase() === wanted,
    );
    if (!category) return [];
    const list = await listActivities(repos, { categoryId: category.category.id });
    // Soonest first; items with nothing scheduled go last.
    return [...list].sort((a, b) =>
      a.nextDueOn && b.nextDueOn
        ? a.nextDueOn.localeCompare(b.nextDueOn)
        : a.nextDueOn
          ? -1
          : b.nextDueOn
            ? 1
            : a.activity.name.localeCompare(b.activity.name),
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Digital upkeep</h2>
        <p className="text-sm text-muted">
          Renewals, backups and reviews. Don’t store passwords, authentication secrets or recovery
          codes in Tend.
        </p>
      </div>

      <section aria-label="Add digital item" className="space-y-2">
        <h3 className="text-sm font-medium">Add</h3>
        <div className="flex flex-wrap gap-2">
          {DIGITAL_PRESETS.map((p) => (
            <Link key={p.key} to={`/activities/new?preset=${p.key}`} className="btn">
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      {items.status === 'loading' ? <p className="text-muted">Loading…</p> : null}
      {items.status === 'error' ? (
        <p role="alert" className="text-danger">
          Could not load digital items: {items.message}
        </p>
      ) : null}
      {items.status === 'ready' && items.data.length === 0 ? (
        <p className="card border-dashed p-4 text-muted">
          Nothing here yet. Add a renewal, backup check or security review above.
        </p>
      ) : null}
      {items.status === 'ready' && items.data.length > 0 ? (
        <ul className="space-y-2">
          {items.data.map(({ activity, schedules, nextDueOn }) => (
            <li
              key={activity.id}
              className="flex flex-wrap items-center justify-between gap-2 card p-3"
            >
              <div>
                <p className="font-medium">{activity.name}</p>
                <p className="text-sm text-muted">
                  <span className="capitalize">{activity.type}</span>
                  {' · '}
                  {activity.archivedAt !== undefined
                    ? 'Archived'
                    : schedules[0]?.pausedAt !== undefined
                      ? 'Paused'
                      : nextDueOn
                        ? `next ${formatDate(nextDueOn)}`
                        : 'Not scheduled'}
                </p>
              </div>
              <Link
                to={`/activities/${activity.id}/edit`}
                className="btn"
                aria-label={`Edit ${activity.name}`}
              >
                Edit
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
