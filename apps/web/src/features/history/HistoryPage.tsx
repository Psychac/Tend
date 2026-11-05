import { useState } from 'react';
import { getHistory, listActivities, undoCompletion, type HistoryEntry } from '@upkeep/application';
import { formatMoney, type ActivityId, type Instant } from '@upkeep/domain';
import { useApp } from '../../app/providers/AppProvider';
import {
  describeError,
  deviceTimeZone,
  formatDate,
  useAction,
  useLiveQuery,
} from '../../shared/hooks';
import { CompletionEditor } from './CompletionEditor';

const PAGE = 30;

type KindFilter = 'all' | 'completed' | 'skipped';

function whenLabel(at: Instant): string {
  return new Date(at).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: deviceTimeZone(),
  });
}

function timingLabel(days: number): string {
  if (days === 0) return 'on time';
  const n = Math.abs(days);
  return `${n} day${n === 1 ? '' : 's'} ${days > 0 ? 'late' : 'early'}`;
}

export function HistoryPage() {
  const [activityId, setActivityId] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [shown, setShown] = useState(PAGE);

  const activities = useLiveQuery(({ repos }) => listActivities(repos, { includeArchived: true }));
  const history = useLiveQuery(
    ({ repos }) =>
      getHistory(repos, {
        activityId: activityId ? (activityId as ActivityId) : undefined,
        kind: kind === 'all' ? undefined : kind,
        limit: shown,
        timeZone: deviceTimeZone(),
      }),
    `${activityId}|${kind}|${shown}`,
  );

  const reset = () => setShown(PAGE);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">History</h2>

      <div className="flex flex-wrap gap-4">
        <label className="block text-sm">
          Activity
          <select
            value={activityId}
            onChange={(e) => {
              setActivityId(e.target.value);
              reset();
            }}
            className="mt-1 block field"
          >
            <option value="">All activities</option>
            {activities.status === 'ready'
              ? activities.data.map((a) => (
                  <option key={a.activity.id} value={a.activity.id}>
                    {a.activity.name}
                  </option>
                ))
              : null}
          </select>
        </label>
        <label className="block text-sm">
          Show
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as KindFilter);
              reset();
            }}
            className="mt-1 block field"
          >
            <option value="all">Done and skipped</option>
            <option value="completed">Done only</option>
            <option value="skipped">Skipped only</option>
          </select>
        </label>
      </div>

      {history.status === 'loading' ? <p className="text-muted">Loading…</p> : null}
      {history.status === 'error' ? (
        <p role="alert" className="text-danger">
          {history.message}
        </p>
      ) : null}
      {history.status === 'ready' && history.data.entries.length === 0 ? (
        <p className="text-muted">
          {activityId || kind !== 'all'
            ? 'Nothing matches these filters.'
            : 'Nothing has been done yet. Completed and skipped work will appear here.'}
        </p>
      ) : null}
      {history.status === 'ready' ? (
        <>
          <ul className="space-y-2">
            {history.data.entries.map((entry) => (
              <EntryRow
                key={entry.kind === 'completed' ? entry.completion.id : entry.occurrence.id}
                entry={entry}
              />
            ))}
          </ul>
          {history.data.hasMore ? (
            <button
              type="button"
              onClick={() => setShown(shown + PAGE)}
              className="card px-3 py-1 text-sm hover:bg-sunken"
            >
              Show more
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function EntryRow({ entry }: { entry: HistoryEntry }) {
  if (entry.kind === 'skipped') {
    return (
      <li className="card p-3">
        <p className="font-medium">
          {entry.activityName} <span className="text-sm font-normal text-muted">· Skipped</span>
        </p>
        <p className="text-sm text-muted">
          Was due {formatDate(entry.occurrence.dueOn)} · {whenLabel(entry.at)}
        </p>
      </li>
    );
  }

  return <DoneRow entry={entry} />;
}

const small =
  'btn';

function DoneRow({ entry }: { entry: Extract<HistoryEntry, { kind: 'completed' }> }) {
  const { deps } = useApp();
  const act = useAction();
  const { completion } = entry;
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-undo'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function undo() {
    setBusy(true);
    setError(null);
    const result = await act(() => undoCompletion(deps, { completionId: completion.id }));
    setBusy(false);
    if (!result.ok) setError(describeError(result.error));
  }

  return (
    <li className="card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {entry.activityName}{' '}
            <span className="text-sm font-normal text-ok">· Done</span>
            {entry.edited ? (
              <span className="ml-1 text-xs font-normal text-muted">(edited)</span>
            ) : null}
          </p>
          <p className="text-sm text-muted">
            {whenLabel(entry.at)}
            {completion.plannedFor ? ` · ${timingLabel(entry.daysFromPlanned)}` : ''}
          </p>
        </div>
        {mode === 'view' ? (
          <div className="flex gap-2">
            <button
              type="button"
              className={small}
              aria-label={`Edit ${entry.activityName}`}
              onClick={() => setMode('edit')}
            >
              Edit
            </button>
            <button
              type="button"
              className={small}
              aria-label={`Undo ${entry.activityName}`}
              onClick={() => setMode('confirm-undo')}
            >
              Undo
            </button>
          </div>
        ) : null}
      </div>

      {mode === 'confirm-undo' ? (
        <div
          role="alertdialog"
          aria-label="Confirm undo"
          className="mt-2 rounded border border-warn-line bg-warn-soft p-2 text-sm"
        >
          <p>
            Undo this entry? It stops counting, and the work goes back to due. The original stays on
            record.
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={small} disabled={busy} onClick={() => void undo()}>
              Yes, undo it
            </button>
            <button type="button" className={small} onClick={() => setMode('view')}>
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {mode === 'edit' ? <CompletionEditor entry={entry} onDone={() => setMode('view')} /> : null}

      <dl className="mt-1 space-y-0.5 text-sm">
        {completion.cost ? (
          <div className="flex gap-1">
            <dt className="text-muted">Cost:</dt>
            <dd>{formatMoney(completion.cost)}</dd>
          </div>
        ) : null}
        {entry.checklistTotal > 0 ? (
          <div className="flex gap-1">
            <dt className="text-muted">Checklist:</dt>
            <dd>
              {entry.checklistDone} of {entry.checklistTotal} done
            </dd>
          </div>
        ) : null}
        {entry.measurements.map((m) =>
          m.value.kind === 'numeric' ? (
            <div key={m.id} className="flex gap-1">
              <dt className="text-muted">{m.key}:</dt>
              <dd>
                {m.value.quantity.value} {m.value.quantity.unit}
              </dd>
            </div>
          ) : null,
        )}
        {completion.notes ? <p className="text-muted">{completion.notes}</p> : null}
      </dl>
    </li>
  );
}
