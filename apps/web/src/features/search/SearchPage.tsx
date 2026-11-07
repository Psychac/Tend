import { Link, useSearchParams } from 'react-router';
import { searchAll } from '@tend/application';
import { localDateOf } from '@tend/domain';
import { deviceTimeZone, formatDate, useLiveQuery } from '../../shared/hooks';

/** One box that finds activities, assets and the notes written when work was done. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const results = useLiveQuery(({ repos }) => searchAll(repos, q), `q:${q}`);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Search</h2>
      <label className="block text-sm">
        Search everything
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) =>
            setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
          }
          placeholder="An activity, an asset, or a note"
          className="field mt-1 block w-full max-w-md"
        />
      </label>

      {q.trim() === '' ? (
        <p className="text-muted">Type to search activities, assets and notes.</p>
      ) : null}
      {results.status === 'error' ? (
        <p role="alert" className="text-danger">
          {results.message}
        </p>
      ) : null}

      {results.status === 'ready' && q.trim() !== '' ? <Results r={results.data} /> : null}
    </div>
  );
}

function Results({ r }: { r: Awaited<ReturnType<typeof searchAll>> }) {
  if (r.activities.length + r.assets.length + r.notes.length === 0) {
    return <p className="text-muted">Nothing matches “{r.query}”.</p>;
  }
  return (
    <div className="space-y-5">
      {r.activities.length > 0 ? (
        <section aria-labelledby="s-act" className="space-y-2">
          <h3 id="s-act" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Activities
          </h3>
          <ul className="card divide-y divide-line py-1 text-sm">
            {r.activities.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-2">
                <Link
                  to={`/activities?q=${encodeURIComponent(a.name)}`}
                  className="font-medium underline"
                >
                  {a.name}
                </Link>
                <span className="text-muted">{a.archivedAt ? 'Archived' : a.type}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {r.assets.length > 0 ? (
        <section aria-labelledby="s-asset" className="space-y-2">
          <h3 id="s-asset" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Assets
          </h3>
          <ul className="card divide-y divide-line py-1 text-sm">
            {r.assets.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-2">
                <Link to="/assets" className="font-medium underline">
                  {a.name}
                </Link>
                <span className="text-muted">{a.status.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {r.notes.length > 0 ? (
        <section aria-labelledby="s-notes" className="space-y-2">
          <h3 id="s-notes" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Notes
          </h3>
          <ul className="card divide-y divide-line py-1 text-sm">
            {r.notes.map(({ completion, activityName }) => (
              <li key={completion.id} className="py-2">
                <Link to="/history" className="font-medium underline">
                  {activityName}
                </Link>{' '}
                <span className="text-muted">
                  on {formatDate(localDateOf(completion.completedAt, deviceTimeZone()))}
                </span>
                <p>{completion.notes}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
