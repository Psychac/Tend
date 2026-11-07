import { Link } from 'react-router';
import {
  DIGITAL_CATEGORY,
  HOUSEHOLD_CATEGORY,
  HOUSEHOLD_PRESETS,
  listActivities,
  listCategories,
  type ActivityListItem,
} from '@tend/application';
import { formatDate, useLiveQuery } from '../../shared/hooks';

const NO_PLACE = 'No place set';

const byDue = (a: ActivityListItem, b: ActivityListItem) =>
  a.nextDueOn && b.nextDueOn
    ? a.nextDueOn.localeCompare(b.nextDueOn)
    : a.nextDueOn
      ? -1
      : b.nextDueOn
        ? 1
        : a.activity.name.localeCompare(b.activity.name);

/**
 * Household upkeep grouped by room: anything filed under Household, anything with a place,
 * and cleaning tasks. Digital items are left to their own page.
 */
export function HouseholdPage() {
  const groups = useLiveQuery(async ({ repos }) => {
    const categories = await listCategories(repos);
    const idOf = (name: string) =>
      categories.find((c) => c.category.name.trim().toLowerCase() === name.toLowerCase())?.category
        .id;
    const household = idOf(HOUSEHOLD_CATEGORY);
    const digital = idOf(DIGITAL_CATEGORY);
    const list = await listActivities(repos, {});
    const mine = list.filter(
      ({ activity }) =>
        activity.archivedAt === undefined &&
        (digital === undefined || activity.categoryId !== digital) &&
        ((household !== undefined && activity.categoryId === household) ||
          activity.locationId !== undefined ||
          activity.type === 'cleaning'),
    );
    const byRoom = new Map<string, ActivityListItem[]>();
    for (const item of mine) {
      const room = item.locationPath ?? NO_PLACE;
      byRoom.set(room, [...(byRoom.get(room) ?? []), item]);
    }
    return [...byRoom.entries()]
      .map(([room, items]) => ({ room, items: items.sort(byDue) }))
      .sort((a, b) =>
        a.room === NO_PLACE ? 1 : b.room === NO_PLACE ? -1 : a.room.localeCompare(b.room),
      );
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Household</h2>
        <p className="text-sm text-muted">
          Cleaning and upkeep by room. Give an activity a place to have it appear under that room.
        </p>
      </div>

      <section aria-label="Add household item" className="space-y-2">
        <h3 className="text-sm font-medium">Add</h3>
        <div className="flex flex-wrap gap-2">
          {HOUSEHOLD_PRESETS.map((p) => (
            <Link key={p.key} to={`/activities/new?preset=${p.key}`} className="btn">
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      {groups.status === 'loading' ? <p className="text-muted">Loading…</p> : null}
      {groups.status === 'error' ? (
        <p role="alert" className="text-danger">
          Could not load household items: {groups.message}
        </p>
      ) : null}
      {groups.status === 'ready' && groups.data.length === 0 ? (
        <p className="card border-dashed p-4 text-muted">
          Nothing here yet. Add a room clean or a seasonal chore above.
        </p>
      ) : null}
      {groups.status === 'ready'
        ? groups.data.map(({ room, items }) => (
            <section key={room} aria-label={room} className="space-y-2">
              <h3 className="text-sm font-medium">{room}</h3>
              <ul className="space-y-2">
                {items.map(({ activity, schedules, nextDueOn }) => (
                  <li
                    key={activity.id}
                    className="flex flex-wrap items-center justify-between gap-2 card p-3"
                  >
                    <div>
                      <p className="font-medium">{activity.name}</p>
                      <p className="text-sm text-muted">
                        <span className="capitalize">{activity.type}</span>
                        {' · '}
                        {schedules[0]?.pausedAt !== undefined
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
            </section>
          ))
        : null}
    </div>
  );
}
