import { useState, type FormEvent } from 'react';
import {
  completeOccurrence,
  skipOccurrence,
  snoozeOccurrence,
  type MeasurementInput,
  type OccurrenceItem,
} from '@upkeep/application';
import { addDays, type ChecklistItemId, type LocalDate } from '@upkeep/domain';
import { useApp } from '../../app/providers/AppProvider';
import { describeError, formatDate, useAction } from '../../shared/hooks';

interface Props {
  readonly item: OccurrenceItem;
  readonly today: LocalDate;
}

const button =
  'rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50';
const primary =
  'rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50';

function timingLabel(item: OccurrenceItem): string | null {
  if (item.timing === 'overdue')
    return `${item.daysLate} day${item.daysLate === 1 ? '' : 's'} overdue`;
  if (item.timing === 'in_grace')
    return `${item.daysLate} day${item.daysLate === 1 ? '' : 's'} late (within grace)`;
  return null;
}

/** One piece of outstanding work, with quick completion and optional details. */
export function OccurrenceCard({ item, today }: Props) {
  const { deps } = useApp();
  const act = useAction();
  const { activity, occurrence } = item;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredMeasurements = activity.measurementRequirements.filter((r) => r.required);
  const late = timingLabel(item);

  async function run(work: () => ReturnType<Parameters<typeof act>[0]>) {
    setBusy(true);
    setError(null);
    const result = await act(work);
    setBusy(false);
    if (!result.ok) setError(describeError(result.error));
  }

  const quickDone = () => {
    // Required measurements cannot be skipped, so ask for them instead of failing.
    if (requiredMeasurements.length > 0) {
      setOpen(true);
      return;
    }
    void run(() => completeOccurrence(deps, { occurrenceId: occurrence.id }));
  };

  return (
    <li className="rounded border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{activity.name}</p>
          <p className="text-sm text-slate-600">
            {formatDate(item.dueOn)}
            {late ? <span className="ml-2 font-medium text-amber-700">{late}</span> : null}
            {item.occurrence.status === 'snoozed' ? (
              <span className="ml-2 text-slate-500">(snoozed)</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={busy} onClick={quickDone}>
            Done
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => setOpen(!open)}>
            Details
          </button>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() =>
              void run(() =>
                snoozeOccurrence(deps, { occurrenceId: occurrence.id, until: addDays(today, 1) }),
              )
            }
          >
            Snooze a day
          </button>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => void run(() => skipOccurrence(deps, { occurrenceId: occurrence.id }))}
          >
            Skip
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {open ? <CompletionDetails item={item} busy={busy} onSubmit={(input) => run(input)} /> : null}
    </li>
  );
}

function CompletionDetails({
  item,
  busy,
  onSubmit,
}: {
  item: OccurrenceItem;
  busy: boolean;
  onSubmit: (work: () => ReturnType<typeof completeOccurrence>) => Promise<void>;
}) {
  const { deps } = useApp();
  const { activity, occurrence } = item;
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [done, setDone] = useState<Set<string>>(new Set());
  const [readings, setReadings] = useState<Record<string, string>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const measurements: MeasurementInput[] = activity.measurementRequirements.flatMap((r) => {
      const raw = readings[r.key];
      return raw
        ? [{ kind: 'numeric' as const, key: r.key, value: Number(raw), unit: r.unit }]
        : [];
    });
    void onSubmit(() =>
      completeOccurrence(deps, {
        occurrenceId: occurrence.id,
        notes: notes || undefined,
        cost: cost ? { minor: Math.round(Number(cost) * 100), currency: 'INR' } : undefined,
        checklistResults: activity.checklist.map((c) => ({
          itemId: c.id as ChecklistItemId,
          done: done.has(c.id),
        })),
        measurements,
      }),
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-slate-200 pt-3">
      {activity.checklist.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-medium">Checklist</legend>
          {activity.checklist.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={done.has(c.id)}
                onChange={(e) => {
                  const next = new Set(done);
                  if (e.target.checked) next.add(c.id);
                  else next.delete(c.id);
                  setDone(next);
                }}
              />
              {c.label}
            </label>
          ))}
        </fieldset>
      ) : null}

      {activity.measurementRequirements.map((r) => (
        <label key={r.key} className="block text-sm">
          {r.key} ({r.unit}){r.required ? ' *' : ''}
          <input
            type="number"
            step="any"
            required={r.required}
            value={readings[r.key] ?? ''}
            onChange={(e) => setReadings({ ...readings, [r.key]: e.target.value })}
            className="mt-1 block w-40 rounded border border-slate-300 px-2 py-1"
          />
        </label>
      ))}

      <label className="block text-sm">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
        />
      </label>

      <label className="block text-sm">
        Cost (INR)
        <input
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="mt-1 block w-40 rounded border border-slate-300 px-2 py-1"
        />
      </label>

      <button type="submit" disabled={busy} className={primary}>
        Save and mark done
      </button>
    </form>
  );
}
