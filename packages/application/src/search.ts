import type { Repositories } from '@tend/contracts';
import type { Activity, ActivityId, Asset, Completion } from '@tend/domain';

export interface SearchResults {
  readonly query: string;
  readonly activities: readonly Activity[];
  readonly assets: readonly Asset[];
  /** Past entries whose note mentions the text, with the activity they belong to. */
  readonly notes: readonly { readonly completion: Completion; readonly activityName: string }[];
}

const MAX_NOTES_SCANNED = 1000;

/**
 * One search across activities (including archived), assets (including retired) and the notes
 * written when work was done. Matching is by plain text, ignoring case.
 */
export async function searchAll(repos: Repositories, query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q === '') return { query: q, activities: [], assets: [], notes: [] };
  const [activities, assets, completions, everyActivity] = await Promise.all([
    repos.activities.list({ search: q, includeArchived: true }),
    repos.assets.list({ search: q }),
    repos.completions.list({ limit: MAX_NOTES_SCANNED }),
    repos.activities.list({ includeArchived: true }),
  ]);
  const name = new Map<ActivityId, string>(everyActivity.map((a) => [a.id, a.name]));
  const needle = q.toLowerCase();
  return {
    query: q,
    activities,
    assets,
    notes: completions
      .filter((c) => c.notes?.toLowerCase().includes(needle))
      .map((completion) => ({
        completion,
        activityName: name.get(completion.activityId) ?? 'Deleted activity',
      })),
  };
}
