import { Link } from 'react-router';
import {
  DIGITAL_CATEGORY,
  ROUTINE_PRESETS,
  listActivities,
  listCategories,
} from '@tend/application';
import type { ActivityType } from '@tend/domain';
import { formatDate, useLiveQuery } from '../../shared/hooks';

const ROUTINE_TYPES: readonly ActivityType[] = ['routine', 'administrative', 'custom'];

/**
 * Personal routines and life admin, listed by next due date. "User-defined types" are not a
 * separate entity: use the `custom` type and a category of your own (G-15).
 */
export function RoutinesPage() {
  const items = useLiveQuery(async ({ repos }) => {
    const digital = (await listCategories(repos)).find(
      (c) => c.category.name.trim().toLowerCase() === DIGITAL_CATEGORY.toLowerCase(),
    )?.category.id;
    const list = await listActivities(repos, {});
    return list
      .filter(
        ({ activity }) =>
          ROUTINE_TYPES.includes(activity.type) &&
          (digital === undefined || activity.categoryId !== digital),
      )
      .sort((a, b) =>
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
        <h2 className="text-2xl font-semibold">Routines</h2>
        <p className="text-sm text-muted">
          Personal routines and life admin: activities of type Routine, Administrative or Custom.
          For your own kind of activity, use Custom and give it a category.
        </p>
      </div>

      <section aria-label="Add routine" className="space-y-2">
        <h3 className="text-sm font-medium">Add</h3>
        <div className="flex flex-wrap gap-2">
          {ROUTINE_PRESETS.map((p) => (
            <Link key={p.key} to={`/activities/new?preset=${p.key}`} className="btn">
              {p.label}
            </Link>
          ))}
          <Link to="/activities/new" className="btn">
            Blank activity
          </Link>
        </div>
      </section>

      {items.status === 'loading' ? <p className="text-muted">Loading…</p> : null}
      {items.status === 'error' ? (
        <p role="alert" className="text-danger">
          Could not load routines: {items.message}
        </p>
      ) : null}
      {items.status === 'ready' && items.data.length === 0 ? (
        <p className="card border-dashed p-4 text-muted">
          Nothing here yet. Add a weekly review or another routine above.
        </p>
      ) : null}
      {items.status === 'ready' && items.data.length > 0 ? (
        <ul className="space-y-2">
          {items.data.map(({ activity, schedules, nextDueOn, categoryName }) => (
            <li
              key={activity.id}
              className="flex flex-wrap items-center justify-between gap-2 card p-3"
            >
              <div>
                <p className="font-medium">{activity.name}</p>
                <p className="text-sm text-muted">
                  <span className="capitalize">{activity.type}</span>
                  {categoryName ? ` · ${categoryName}` : ''}
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
