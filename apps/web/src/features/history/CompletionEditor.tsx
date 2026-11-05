import { useState, type FormEvent } from 'react';
import { correctCompletion, type HistoryEntry, type MeasurementInput } from '@upkeep/application';
import {
  currencyExponent,
  instantFromLocal,
  localDateOf,
  localTimeOf,
  parseLocalDate,
  parseMoney,
} from '@upkeep/domain';
import { useApp } from '../../app/providers/AppProvider';
import { MoneyField, useMoneyState } from '../../shared/currency';
import { describeError, deviceTimeZone, useAction } from '../../shared/hooks';

type Done = Extract<HistoryEntry, { kind: 'completed' }>;

const primary =
  'rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50';
const button =
  'rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50';

interface Reading {
  readonly key: string;
  readonly unit: string;
  readonly required: boolean;
}

/**
 * Corrects a past entry. The person sees one form with the old values filled in;
 * saving records a corrected entry and keeps the original (see `correctCompletion`).
 */
export function CompletionEditor({ entry, onDone }: { entry: Done; onDone: () => void }) {
  const { deps } = useApp();
  const act = useAction();
  const { completion } = entry;

  const timeZone = deviceTimeZone();
  const originalDate = localDateOf(completion.completedAt, timeZone);
  const originalTime = localTimeOf(completion.completedAt, timeZone);
  const [doneDate, setDoneDate] = useState<string>(originalDate);
  const [doneTime, setDoneTime] = useState(originalTime);
  const [notes, setNotes] = useState(completion.notes ?? '');
  const [cost, setCost] = useMoneyState(
    completion.cost
      ? {
          currency: completion.cost.currency,
          amount: (
            completion.cost.minor /
            10 ** currencyExponent(completion.cost.currency)
          ).toFixed(currencyExponent(completion.cost.currency)),
        }
      : undefined,
  );
  const [done, setDone] = useState(
    () => new Set(completion.checklistResults.filter((r) => r.done).map((r) => r.itemId as string)),
  );

  // One reading field per requirement, plus any recorded reading the requirements do not list.
  const readings: Reading[] = [
    ...entry.measurementRequirements,
    ...entry.measurements.flatMap((m) =>
      m.value.kind === 'numeric' && !entry.measurementRequirements.some((r) => r.key === m.key)
        ? [{ key: m.key, unit: m.value.quantity.unit, required: false }]
        : [],
    ),
  ];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      entry.measurements.flatMap((m) =>
        m.value.kind === 'numeric' ? [[m.key, String(m.value.quantity.value)]] : [],
      ),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedCost = cost.amount.trim() ? parseMoney(cost.amount, cost.currency) : undefined;
    if (parsedCost && !parsedCost.ok) return setError(describeError(parsedCost.error));

    // Only send a new time if the person changed it, so an untouched entry keeps its exact original.
    let completedAt: string | undefined;
    if (doneDate !== originalDate || doneTime !== originalTime) {
      const date = parseLocalDate(doneDate);
      if (!date.ok || !/^\d{2}:\d{2}$/.test(doneTime))
        return setError('Choose the date and time it was done.');
      completedAt = instantFromLocal(date.value, doneTime, timeZone);
    }

    const measurements: MeasurementInput[] = readings.flatMap((r) =>
      values[r.key]
        ? [{ kind: 'numeric' as const, key: r.key, value: Number(values[r.key]), unit: r.unit }]
        : [],
    );
    setBusy(true);
    const result = await act(() =>
      correctCompletion(deps, {
        completionId: completion.id,
        details: {
          completedAt,
          notes: notes || undefined,
          cost: parsedCost?.ok ? parsedCost.value : undefined,
          checklistResults: entry.checklist.map((c) => ({
            itemId: c.id,
            done: done.has(c.id),
          })),
          measurements,
        },
      }),
    );
    setBusy(false);
    if (result.ok) onDone();
    else setError(describeError(result.error));
  }

  return (
    <form
      onSubmit={submit}
      aria-label={`Edit entry for ${entry.activityName}`}
      className="mt-3 space-y-3 border-t border-slate-200 pt-3"
    >
      {entry.checklist.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-medium">Checklist</legend>
          {entry.checklist.map((c) => (
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

      {readings.map((r) => (
        <label key={r.key} className="block text-sm">
          {r.key} ({r.unit}){r.required ? ' *' : ''}
          <input
            type="number"
            step="any"
            required={r.required}
            value={values[r.key] ?? ''}
            onChange={(e) => setValues({ ...values, [r.key]: e.target.value })}
            className="mt-1 block w-40 rounded border border-slate-300 px-2 py-1"
          />
        </label>
      ))}

      <div className="flex flex-wrap gap-3">
        <label className="block text-sm">
          Done on
          <input
            type="date"
            required
            value={doneDate}
            onChange={(e) => setDoneDate(e.target.value)}
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="block text-sm">
          At
          <input
            type="time"
            required
            value={doneTime}
            onChange={(e) => setDoneTime(e.target.value)}
            className="mt-1 block rounded border border-slate-300 px-2 py-1"
          />
        </label>
      </div>

      <label className="block text-sm">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1"
        />
      </label>

      <MoneyField label="Cost" value={cost} onChange={setCost} />

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primary}>
          Save changes
        </button>
        <button type="button" className={button} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
