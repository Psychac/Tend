import { getRecentChanges } from '@tend/application';
import { localDateOf, localTimeOf } from '@tend/domain';
import { deviceTimeZone, formatDate, useLiveQuery } from '../../shared/hooks';

/** A read-only list of what changed lately, so a person can see what happened and when. */
export function ChangesSection() {
  const changes = useLiveQuery(({ repos }) => getRecentChanges(repos, 30));
  const zone = deviceTimeZone();
  return (
    <section aria-labelledby="changes-heading" className="space-y-2">
      <h3 id="changes-heading" className="text-lg font-medium">
        Recent changes
      </h3>
      <p className="text-sm text-muted">
        The last 30 things that changed on this device, newest first. To undo a completion, use
        History.
      </p>
      {changes.status === 'loading' ? <p className="text-sm text-muted">Loading…</p> : null}
      {changes.status === 'error' ? (
        <p role="alert" className="text-sm text-danger">
          {changes.message}
        </p>
      ) : null}
      {changes.status === 'ready' && changes.data.length === 0 ? (
        <p className="text-sm text-muted">Nothing has changed yet.</p>
      ) : null}
      {changes.status === 'ready' && changes.data.length > 0 ? (
        <ul className="card divide-y divide-line py-1 text-sm">
          {changes.data.map((c) => (
            <li key={c.id} className="flex flex-wrap justify-between gap-x-3 py-2">
              <span>{c.text}</span>
              <span className="text-muted">
                {formatDate(localDateOf(c.at, zone))} {localTimeOf(c.at, zone)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
