import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { createActivity, listAssets, type ScheduleInput } from '@upkeep/application';
import {
  localDateOf,
  type AssetId,
  type ActivityType,
  type IsoWeekday,
  type Priority,
  type RecurrenceUnit,
  type ScheduleStrategy,
} from '@upkeep/domain';
import { useApp } from '../../app/providers/AppProvider';
import { describeError, deviceTimeZone, useAction, useLiveQuery } from '../../shared/hooks';

const TYPES: ActivityType[] = [
  'cleaning',
  'inspection',
  'maintenance',
  'replacement',
  'renewal',
  'routine',
  'administrative',
  'custom',
];
const WEEKDAYS: [IsoWeekday, string][] = [
  [1, 'Mon'],
  [2, 'Tue'],
  [3, 'Wed'],
  [4, 'Thu'],
  [5, 'Fri'],
  [6, 'Sat'],
  [7, 'Sun'],
];

type Repeat = 'none' | 'calendar' | 'after_completion' | 'usage';

const field = 'mt-1 block w-full max-w-md rounded border border-slate-300 px-2 py-1';

export function ActivityFormPage() {
  const { deps } = useApp();
  const act = useAction();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ActivityType>('routine');
  const [priority, setPriority] = useState<Priority>('normal');
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [every, setEvery] = useState('1');
  const [unit, setUnit] = useState<RecurrenceUnit>('week');
  const [weekdays, setWeekdays] = useState<IsoWeekday[]>([]);
  const [startsOn, setStartsOn] = useState(() => localDateOf(deps.clock.now(), deviceTimeZone()));
  const [graceDays, setGraceDays] = useState('0');
  const [checklist, setChecklist] = useState('');
  const [assetId, setAssetId] = useState('');
  const [meterKey, setMeterKey] = useState('odometer');
  const [meterUnit, setMeterUnit] = useState('km');
  const [usageEvery, setUsageEvery] = useState('5000');
  const assets = useLiveQuery(({ repos }) => listAssets(repos));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function buildSchedule(): ScheduleInput | undefined {
    if (repeat === 'none') return undefined;
    const interval = { every: Number(every), unit };
    const strategy: ScheduleStrategy =
      repeat === 'usage'
        ? {
            kind: 'usage',
            meterKey,
            every: { value: Number(usageEvery), unit: meterUnit },
          }
        : repeat === 'calendar'
          ? {
              kind: 'calendar',
              interval,
              byWeekday: unit === 'week' && weekdays.length > 0 ? weekdays : undefined,
            }
          : { kind: 'completion_interval', interval };
    return { strategy, timeZone: deviceTimeZone(), startsOn, graceDays: Number(graceDays) };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await act(() =>
      createActivity(deps, {
        name,
        description: description || undefined,
        type,
        priority,
        checklist: checklist
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        assetId: assetId ? (assetId as AssetId) : undefined,
        schedule: buildSchedule(),
      }),
    );
    setBusy(false);
    if (result.ok) navigate('/activities');
    else setError(describeError(result.error));
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">New activity</h2>

      <label className="block text-sm">
        Name
        <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>

      <label className="block text-sm">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={field}
        />
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="block text-sm">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ActivityType)}
            className={field}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0]?.toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Priority
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className={field}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        Asset (optional)
        <select
          value={assetId}
          onChange={(e) => {
            setAssetId(e.target.value);
            if (!e.target.value && repeat === 'usage') setRepeat('none');
          }}
          className={field}
        >
          <option value="">None</option>
          {assets.status === 'ready'
            ? assets.data.map((a) => (
                <option key={a.asset.id} value={a.asset.id}>
                  {a.asset.name}
                </option>
              ))
            : null}
        </select>
      </label>

      <label className="block text-sm">
        Repeats
        <select
          value={repeat}
          onChange={(e) => setRepeat(e.target.value as Repeat)}
          className={field}
        >
          <option value="none">Does not repeat</option>
          <option value="calendar">On a fixed calendar (e.g. every week)</option>
          <option value="after_completion">After I complete it (e.g. 30 days later)</option>
          {assetId ? <option value="usage">By usage (e.g. every 5,000 km)</option> : null}
        </select>
      </label>

      {repeat !== 'none' ? (
        <fieldset className="space-y-3 rounded border border-slate-200 bg-white p-3">
          <legend className="px-1 text-sm font-medium">Schedule</legend>
          {repeat === 'usage' ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                Meter
                <input
                  required
                  value={meterKey}
                  onChange={(e) => setMeterKey(e.target.value)}
                  className="mt-1 block w-32 rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="block text-sm">
                Every
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={usageEvery}
                  onChange={(e) => setUsageEvery(e.target.value)}
                  className="mt-1 block w-28 rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="block text-sm">
                Unit
                <input
                  required
                  value={meterUnit}
                  onChange={(e) => setMeterUnit(e.target.value)}
                  className="mt-1 block w-20 rounded border border-slate-300 px-2 py-1"
                />
              </label>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                Every
                <input
                  type="number"
                  min="1"
                  value={every}
                  onChange={(e) => setEvery(e.target.value)}
                  className="mt-1 block w-20 rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="block text-sm">
                Unit
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}
                  className="mt-1 block rounded border border-slate-300 px-2 py-1"
                >
                  <option value="day">days</option>
                  <option value="week">weeks</option>
                  <option value="month">months</option>
                  <option value="year">years</option>
                </select>
              </label>
            </div>
          )}

          {repeat === 'calendar' && unit === 'week' ? (
            <fieldset>
              <legend className="text-sm">On these days (optional)</legend>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map(([n, label]) => (
                  <label key={n} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={weekdays.includes(n)}
                      onChange={(e) =>
                        setWeekdays(
                          e.target.checked ? [...weekdays, n] : weekdays.filter((d) => d !== n),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <label className="block text-sm">
              Starting
              <input
                type="date"
                required
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value as typeof startsOn)}
                className="mt-1 block rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="block text-sm">
              Grace days
              <input
                type="number"
                min="0"
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
                className="mt-1 block w-24 rounded border border-slate-300 px-2 py-1"
              />
            </label>
          </div>
        </fieldset>
      ) : null}

      <label className="block text-sm">
        Checklist (one item per line, optional)
        <textarea
          value={checklist}
          onChange={(e) => setChecklist(e.target.value)}
          className={field}
        />
      </label>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Create activity
      </button>
    </form>
  );
}
