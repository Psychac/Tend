import { useState } from 'react';
import { Link } from 'react-router';
import {
  archiveActivity,
  listActivities,
  pauseActivitySchedule,
  resumeActivitySchedule,
  unarchiveActivity,
} from '@upkeep/application';
import type { Result } from '@upkeep/domain';
import { useApp } from '../../app/providers/AppProvider';
import { describeError, formatDate, useAction, useLiveQuery } from '../../shared/hooks';

const small = 'rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100';

export function ActivitiesPage() {
  const { deps } = useApp();
  const act = useAction();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(work: () => Promise<Result<unknown>>) {
    setError(null);
    const r = await act(work);
    if (!r.ok) setError(describeError(r.error));
  }
  const activities = useLiveQuery(
    ({ repos }) =>
      listActivities(repos, { search: search || undefined, includeArchived: showArchived }),
    `s:${search}|${showArchived}`,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Activities</h2>
        <Link
          to="/activities/new"
          className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
        >
          New activity
        </Link>
      </div>

      <label className="block text-sm">
        <span className="sr-only">Search activities</span>
        <input
          type="search"
          placeholder="Search activities"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm rounded border border-slate-300 px-2 py-1"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived
      </label>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {activities.status === 'loading' ? <p className="text-slate-600">Loading…</p> : null}
      {activities.status === 'error' ? (
        <p role="alert" className="text-red-700">
          Could not load activities: {activities.message}
        </p>
      ) : null}
      {activities.status === 'ready' && activities.data.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 bg-white p-4 text-slate-700">
          {search
            ? 'No activities match your search.'
            : 'No activities yet. Create your first one.'}
        </p>
      ) : null}

      {activities.status === 'ready' ? (
        <ul className="space-y-2">
          {activities.data.map(({ activity, schedules, nextDueOn }) => (
            <li
              key={activity.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white p-3"
            >
              <div>
                <p className="font-medium">{activity.name}</p>
                <p className="text-sm text-slate-600">
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
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
