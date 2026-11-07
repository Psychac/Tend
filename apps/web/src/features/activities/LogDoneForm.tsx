import { useState, type FormEvent } from 'react';
import {
  completeOccurrence,
  logCompletion,
  type CompletionDetails,
  type MeasurementInput,
} from '@tend/application';
import {
  instantFromLocal,
  localDateOf,
  parseLocalDate,
  parseMoney,
  type Activity,
  type ChecklistItemId,
} from '@tend/domain';
import { useApp } from '../../app/providers/AppProvider';
import { MoneyField, useMoneyState } from '../../shared/ui/currency';
import {
  describeError,
  deviceTimeZone,
  formatDate,
  useAction,
  useLiveQuery,
} from '../../shared/hooks';

/**
 * Records that an activity was done, now or on an earlier day, from the Activities list.
 * If something for this activity is already due, the person can count it for that item
 * instead, so the Dashboard card is not left overdue after the work is logged.
 */
export function LogDoneForm({ activity, onDone }: { activity: Activity; onDone: () => void }) {
  const { deps } = useApp();
  const act = useAction();
  const timeZone = deviceTimeZone();
  const today = localDateOf(deps.clock.now(), timeZone);

  const [date, setDate] = useState<string>(today);
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useMoneyState();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [readings, setReadings] = useState<Record<string, string>>({});
  const [countForDue, setCountForDue] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const due = useLiveQuery(
    ({ repos }) =>
      repos.occurrences.list({
        activityId: activity.id,
        status: ['pending', 'snoozed'],
        order: 'due_asc',
        limit: 1,
      }),
    `due:${activity.id}`,
  );
  const first = due.status === 'ready' ? due.data[0] : undefined;
  const open = first && first.dueOn <= today ? first : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedCost = cost.amount.trim() ? parseMoney(cost.amount, cost.currency) : undefined;
    if (parsedCost && !parsedCost.ok) return setError(describeError(parsedCost.error));

    // Today means "now"; an earlier day is recorded at midday, since only the date is asked for.
    let completedAt: string | undefined;
    if (date !== today) {
      const parsed = parseLocalDate(date);
      if (!parsed.ok || date > today) return setError('Choose a day that is not in the future.');
      completedAt = instantFromLocal(parsed.value, '12:00', timeZone);
    }

    const measurements: MeasurementInput[] = activity.measurementRequirements.flatMap((r) =>
      readings[r.key]
        ? [{ kind: 'numeric' as const, key: r.key, value: Number(readings[r.key]), unit: r.unit }]
        : [],
    );
    const details: CompletionDetails = {
      completedAt,
      notes: notes || undefined,
      cost: parsedCost?.ok ? parsedCost.value : undefined,
      checklistResults: activity.checklist.map((c) => ({
        itemId: c.id as ChecklistItemId,
        done: done.has(c.id),
      })),
      measurements,
    };

    setBusy(true);
    const result = await act(() =>
      open && countForDue
        ? completeOccurrence(deps, { occurrenceId: open.id, ...details })
        : logCompletion(deps, { activityId: activity.id, ...details }),
    );
    setBusy(false);
    if (result.ok) onDone();
    else setError(describeError(result.error));
  }

  return (
    <form
      onSubmit={submit}
      aria-label={`Log ${activity.name} as done`}
      className="mt-3 space-y-3 border-t border-line pt-3"
    >
      <label className="block text-sm">
        Done on
        <input
          type="date"
          required
          max={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block field"
        />
      </label>

      {open ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={countForDue}
            onChange={(e) => setCountForDue(e.target.checked)}
          />
          Count this for the item due {formatDate(open.dueOn)}
        </label>
      ) : null}

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
            className="mt-1 block w-40 field"
          />
        </label>
      ))}

      <label className="block text-sm">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full field"
        />
      </label>

      <MoneyField label="Cost" value={cost} onChange={setCost} />

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          Save
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
