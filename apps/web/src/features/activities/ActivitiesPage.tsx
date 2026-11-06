import { useState } from 'react';
import { Link } from 'react-router';
import {
  archiveActivity,
  listActivities,
  pauseActivitySchedule,
  resumeActivitySchedule,
  unarchiveActivity,
} from '@tend/application';
import type { CategoryId, LocationId, Result } from '@tend/domain';
import { useApp } from '../../app/providers/AppProvider';
import { describeError, formatDate, useAction, useLiveQuery } from '../../shared/hooks';
import { AttachmentsSection } from '../attachments/AttachmentsSection';
import { CategorySelect, LocationSelect } from '../../shared/ui/pickers';

const small = 'btn';

export function ActivitiesPage() {
  const { deps } = useApp();
  const act = useAction();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState<ReadonlySet<string>>(new Set());
  const toggleFiles = (id: string) =>
    setFilesOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function run(work: () => Promise<Result<unknown>>) {
    setError(null);
    const r = await act(work);
    if (!r.ok) setError(describeError(r.error));
  }
  const activities = useLiveQuery(
    ({ repos }) =>
      listActivities(repos, {
        search: search || undefined,
        includeArchived: showArchived,
        categoryId: categoryFilter ? (categoryFilter as CategoryId) : undefined,
        locationId: locationFilter ? (locationFilter as LocationId) : undefined,
      }),
    `s:${search}|${showArchived}|${categoryFilter}|${locationFilter}`,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Activities</h2>
        <div className="flex items-center gap-2">
          <Link to="/digital" className="btn">
            Digital upkeep
          </Link>
          <Link
            to="/activities/new"
            className="rounded bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-hover"
          >
            New activity
          </Link>
        </div>
      </div>

      <label className="block text-sm">
        <span className="sr-only">Search activities</span>
        <input
          type="search"
          placeholder="Search activities"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm field"
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <CategorySelect
          label="Category"
          empty="All categories"
          value={categoryFilter}
          onChange={setCategoryFilter}
          className="mt-1 block field"
        />
        <LocationSelect
          label="Place"
          empty="All places"
          value={locationFilter}
          onChange={setLocationFilter}
          className="mt-1 block field"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived
      </label>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {activities.status === 'loading' ? <p className="text-muted">Loading…</p> : null}
      {activities.status === 'error' ? (
        <p role="alert" className="text-danger">
          Could not load activities: {activities.message}
        </p>
      ) : null}
      {activities.status === 'ready' && activities.data.length === 0 ? (
        <p className="card border-dashed p-4 text-muted">
          {search
            ? 'No activities match your search.'
            : 'No activities yet. Create your first one.'}
        </p>
      ) : null}

      {activities.status === 'ready' ? (
        <ul className="space-y-2">
          {activities.data.map(({ activity, schedules, nextDueOn, categoryName, locationPath }) => (
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
                    : schedules.length === 0
                      ? 'One-off'
                      : schedules[0]?.pausedAt !== undefined
                        ? 'Recurring (paused)'
                        : 'Recurring'}
                  {nextDueOn ? ` · next ${formatDate(nextDueOn)}` : ''}
                  {categoryName ? ` · ${categoryName}` : ''}
                  {locationPath ? ` · ${locationPath}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={small}
                  aria-expanded={filesOpen.has(activity.id)}
                  aria-label={`Files for ${activity.name}`}
                  onClick={() => toggleFiles(activity.id)}
                >
                  Files
                </button>
                {activity.archivedAt === undefined ? (
                  <Link
                    to={`/activities/${activity.id}/edit`}
                    className={small}
                    aria-label={`Edit ${activity.name}`}
                  >
                    Edit
                  </Link>
                ) : null}
                {activity.archivedAt === undefined && schedules[0] ? (
                  <button
                    type="button"
                    className={small}
                    aria-label={`${schedules[0].pausedAt === undefined ? 'Pause' : 'Resume'} ${activity.name}`}
                    onClick={() =>
                      run(() =>
                        schedules[0]!.pausedAt === undefined
                          ? pauseActivitySchedule(deps, { scheduleId: schedules[0]!.id })
                          : resumeActivitySchedule(deps, { scheduleId: schedules[0]!.id }),
                      )
                    }
                  >
                    {schedules[0].pausedAt === undefined ? 'Pause' : 'Resume'}
                  </button>
                ) : null}
                {activity.archivedAt === undefined ? (
                  <button
                    type="button"
                    className={small}
                    aria-label={`Archive ${activity.name}`}
                    onClick={() => run(() => archiveActivity(deps, { activityId: activity.id }))}
                  >
                    Archive
                  </button>
                ) : (
                  <button
                    type="button"
                    className={small}
                    aria-label={`Restore ${activity.name}`}
                    onClick={() => run(() => unarchiveActivity(deps, { activityId: activity.id }))}
                  >
                    Restore
                  </button>
                )}
              </div>
              {filesOpen.has(activity.id) ? (
                <div className="w-full">
                  <AttachmentsSection
                    subject={{ type: 'activity', id: activity.id }}
                    label={activity.name}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
