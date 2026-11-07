import { useState, type FormEvent } from 'react';
import {
  cancelOccurrence,
  completeOccurrence,
  skipOccurrence,
  snoozeOccurrence,
  type MeasurementInput,
  type OccurrenceItem,
} from '@tend/application';
import { addDays, parseMoney, type ChecklistItemId, type LocalDate } from '@tend/domain';
import { useApp } from '../../app/providers/AppProvider';
import { MoneyField, useMoneyState } from '../../shared/ui/currency';
import { describeError, formatDate, useAction } from '../../shared/hooks';

interface Props {
  readonly item: OccurrenceItem;
  readonly today: LocalDate;
}

const button = 'btn';
const SNOOZE_CHOICES = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
] as const;
const primary = 'btn btn-primary';

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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [panel, setPanel] = useState<'snooze' | 'more' | null>(null);
  const [pickDate, setPickDate] = useState('');
  // A snooze must land after the current due date, even for something long overdue.
  const base = item.dueOn > today ? item.dueOn : today;
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

  const snooze = (until: LocalDate) => {
    setPanel(null);
    void run(() => snoozeOccurrence(deps, { occurrenceId: occurrence.id, until }));
  };

  const quickDone = () => {
    // Required measurements cannot be skipped, so ask for them instead of failing.
    if (requiredMeasurements.length > 0) {
      setOpen(true);
      return;
    }
    void run(() => completeOccurrence(deps, { occurrenceId: occurrence.id }));
  };

  return (
    <li
      className={`card border-l-4 p-3 ${
        item.timing === 'overdue'
          ? 'border-l-danger'
          : item.timing === 'in_grace'
            ? 'border-l-warn-solid'
            : 'border-l-brand'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{activity.name}</p>
          <p className="text-sm text-muted">
            {formatDate(item.dueOn)}
            {late ? <span className="ml-2 font-medium text-warn">{late}</span> : null}
            {item.missedBefore > 0 ? (
              <span className="ml-2 text-sm text-muted">+ {item.missedBefore} earlier missed</span>
            ) : null}
            {item.laterCount > 0 ? (
              <span className="ml-2 text-muted">· {item.laterCount} more coming up</span>
            ) : null}
            {item.occurrence.status === 'snoozed' ? (
              <span className="ml-2 text-muted">(snoozed)</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button type="button" className={primary} disabled={busy} onClick={quickDone}>
            Done
          </button>
          <button type="button" className={button} disabled={busy} onClick={() => setOpen(!open)}>
            Details
          </button>
          <button
            type="button"
            className={button}
            aria-expanded={panel === 'snooze'}
            disabled={busy}
            onClick={() => setPanel(panel === 'snooze' ? null : 'snooze')}
          >
            Snooze
          </button>
          <button
            type="button"
            className={button}
            aria-expanded={panel === 'more'}
            disabled={busy}
            onClick={() => setPanel(panel === 'more' ? null : 'more')}
          >
            More
          </button>
        </div>
      </div>

      {panel === 'snooze' ? (
        <div role="group" aria-label="Snooze until" className="mt-2 flex flex-wrap items-end gap-2">
          {SNOOZE_CHOICES.map((c) => (
            <button
              key={c.label}
              type="button"
              className={button}
              disabled={busy}
              onClick={() => snooze(addDays(base, c.days))}
            >
              {c.label}
            </button>
          ))}
          <label className="block text-sm">
            Pick a date
            <input
              type="date"
              min={addDays(base, 1)}
              value={pickDate}
              onChange={(e) => setPickDate(e.target.value)}
              className="mt-1 block field"
            />
          </label>
          <button
            type="button"
            className={button}
            disabled={busy || !pickDate}
            onClick={() => snooze(pickDate as LocalDate)}
          >
            Snooze to date
          </button>
        </div>
      ) : null}

      {panel === 'more' && !confirmCancel ? (
        <div role="group" aria-label="More actions" className="mt-2 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => void run(() => skipOccurrence(deps, { occurrenceId: occurrence.id }))}
            >
              Skip
            </button>
            <span className="text-muted">Not doing it this time. Counted as skipped.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              Cancel
            </button>
            <span className="text-muted">Remove it from the list. Not counted as skipped.</span>
          </div>
        </div>
      ) : null}

      {confirmCancel ? (
        <div role="group" aria-label="Confirm cancel" className="mt-2 space-y-2 text-sm">
          <p>
            Remove this from your list? It isn't counted as skipped, and stays in History as
            cancelled.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={primary}
              disabled={busy}
              onClick={() =>
                void run(() => cancelOccurrence(deps, { occurrenceId: occurrence.id }))
              }
            >
              Yes, cancel it
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => setConfirmCancel(false)}
            >
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
  const [cost, setCost] = useMoneyState();
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
    const parsedCost = cost.amount.trim() ? parseMoney(cost.amount, cost.currency) : undefined;
    if (parsedCost && !parsedCost.ok) {
      void onSubmit(async () => parsedCost);
      return;
    }
    void onSubmit(() =>
      completeOccurrence(deps, {
        occurrenceId: occurrence.id,
        notes: notes || undefined,
        cost: parsedCost?.ok ? parsedCost.value : undefined,
        checklistResults: activity.checklist.map((c) => ({
          itemId: c.id as ChecklistItemId,
          done: done.has(c.id),
        })),
        measurements,
      }),
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-line pt-3">
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

      <button type="submit" disabled={busy} className={primary}>
        Save and mark done
      </button>
    </form>
  );
}
