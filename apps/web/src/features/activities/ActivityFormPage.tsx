import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  createActivity,
  getActivityReminder,
  listAssets,
  setActivityReminder,
  setActivitySchedule,
  updateActivity,
  type OutstandingPolicy,
  type ScheduleInput,
} from '@tend/application';
import {
  localDateOf,
  type Activity,
  type ActivityId,
  type AssetId,
  type CategoryId,
  type LocationId,
  type ActivityType,
  type IsoWeekday,
  type MeasurementRequirement,
  type Reminder,
  type Priority,
  type RecurrenceUnit,
  type Schedule,
  type ScheduleStrategy,
} from '@tend/domain';
import { useApp } from '../../app/providers/AppProvider';
import { describeError, deviceTimeZone, useAction, useLiveQuery } from '../../shared/hooks';
import { CategorySelect, LocationSelect } from '../../shared/pickers';

export interface ActivityFormInitial {
  readonly activity: Activity;
  readonly reminder?: Reminder | null | undefined;
  readonly schedule?: Schedule | undefined;
}

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

const field = 'field mt-1 block w-full max-w-md';

/** What the form shows for a stored schedule. Types the form cannot express are left untouched. */
function scheduleDefaults(schedule: Schedule | undefined) {
  const s = schedule?.strategy;
  return {
    editable: !s || s.kind === 'calendar' || s.kind === 'completion_interval' || s.kind === 'usage',
    repeat: (!s
      ? 'none'
      : s.kind === 'calendar'
        ? 'calendar'
        : s.kind === 'completion_interval'
          ? 'after_completion'
          : s.kind === 'usage'
            ? 'usage'
            : 'none') as Repeat,
    every: s && 'interval' in s ? String(s.interval.every) : '1',
    unit: (s && 'interval' in s ? s.interval.unit : 'week') as RecurrenceUnit,
    weekdays: (s?.kind === 'calendar' ? (s.byWeekday ?? []) : []) as IsoWeekday[],
    meterKey: s?.kind === 'usage' ? s.meterKey : 'odometer',
    meterUnit: s?.kind === 'usage' ? s.every.unit : 'km',
    usageEvery: s?.kind === 'usage' ? String(s.every.value) : '5000',
    startsOn: schedule?.startsOn,
    graceDays: String(schedule?.policy.graceDays ?? 0),
  };
}

const nextKey = (() => {
  let n = 0;
  return () => `r${(n += 1)}`;
})();

interface RequirementRow extends MeasurementRequirement {
  readonly rowKey: string;
}

/** Creates a new activity, or edits `initial` when given. */
export function ActivityForm({ initial }: { initial?: ActivityFormInitial | undefined }) {
  const { deps } = useApp();
  const act = useAction();
  const navigate = useNavigate();
  const editing = initial !== undefined;
  const sd = scheduleDefaults(initial?.schedule);
  const original = initial?.activity;

  const [name, setName] = useState(original?.name ?? '');
  const [description, setDescription] = useState(original?.description ?? '');
  const [type, setType] = useState<ActivityType>(original?.type ?? 'routine');
  const [priority, setPriority] = useState<Priority>(original?.priority ?? 'normal');
  const [repeat, setRepeat] = useState<Repeat>(sd.repeat);
  const [every, setEvery] = useState(sd.every);
  const [unit, setUnit] = useState<RecurrenceUnit>(sd.unit);
  const [weekdays, setWeekdays] = useState<IsoWeekday[]>(sd.weekdays);
  const [startsOn, setStartsOn] = useState(
    () => sd.startsOn ?? localDateOf(deps.clock.now(), deviceTimeZone()),
  );
  const [graceDays, setGraceDays] = useState(sd.graceDays);
  const [checklist, setChecklist] = useState(
    original?.checklist.map((c) => c.label).join('\n') ?? '',
  );
  const [assetId, setAssetId] = useState(original?.assetId ?? '');
  const [categoryId, setCategoryId] = useState<string>(original?.categoryId ?? '');
  const [locationId, setLocationId] = useState<string>(original?.locationId ?? '');
  const [meterKey, setMeterKey] = useState(sd.meterKey);
  const [meterUnit, setMeterUnit] = useState(sd.meterUnit);
  const [usageEvery, setUsageEvery] = useState(sd.usageEvery);
  const [requirements, setRequirements] = useState<RequirementRow[]>(() =>
    (original?.measurementRequirements ?? []).map((r) => ({ ...r, rowKey: nextKey() })),
  );
  const [outstanding, setOutstanding] = useState<OutstandingPolicy>('supersede_future');
  const [remind, setRemind] = useState(initial?.reminder?.enabled ?? false);
  const [leadDays, setLeadDays] = useState(String(initial?.reminder?.leadDays ?? 0));
  const [atTime, setAtTime] = useState(initial?.reminder?.atTime ?? '09:00');
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

  const checklistLines = () =>
    checklist
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

  const requirementList = (): MeasurementRequirement[] =>
    requirements.map(({ key, unit: u, required }) => ({
      key: key.trim(),
      unit: u.trim(),
      required,
    }));

  /** The schedule as stored, in the same shape the form builds, to detect real changes. */
  function currentSchedule(): ScheduleInput | undefined {
    const stored = initial?.schedule;
    if (!stored) return undefined;
    const base = {
      timeZone: deviceTimeZone(),
      startsOn: stored.startsOn,
      graceDays: stored.policy.graceDays,
    };
    const st = stored.strategy;
    if (st.kind === 'calendar') {
      return {
        ...base,
        strategy: { kind: 'calendar', interval: st.interval, byWeekday: st.byWeekday },
      };
    }
    return { ...base, strategy: st };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (original) {
      // Reuse the id of any checklist line that is unchanged, so past results still match it.
      const free = [...original.checklist];
      const checklistEdits = checklistLines().map((label) => {
        const at = free.findIndex((c) => c.label === label);
        const match = at >= 0 ? free.splice(at, 1)[0] : undefined;
        return { id: match?.id, label };
      });
      const updated = await act(() =>
        updateActivity(deps, {
          activityId: original.id,
          name,
          description: description || undefined,
          type,
          priority,
          assetId: assetId ? (assetId as AssetId) : undefined,
          categoryId: categoryId ? (categoryId as CategoryId) : undefined,
          locationId: locationId ? (locationId as LocationId) : undefined,
          estimatedMinutes: original.estimatedMinutes,
          checklist: checklistEdits,
          measurementRequirements: requirementList(),
        }),
      );
      if (!updated.ok) {
        setBusy(false);
        return setError(describeError(updated.error));
      }
      const schedule = sd.editable ? buildSchedule() : undefined;
      if (schedule && JSON.stringify(schedule) !== JSON.stringify(currentSchedule())) {
        const result = await act(() =>
          setActivitySchedule(deps, { activityId: original.id, schedule, outstanding }),
        );
        if (!result.ok) {
          setBusy(false);
          return setError(
            `Details were saved, but the schedule was not: ${describeError(result.error)}`,
          );
        }
      }
      const savedReminder = await saveReminder(original.id);
      if (!savedReminder.ok) {
        setBusy(false);
        return setError(
          `Details were saved, but the reminder was not: ${describeError(savedReminder.error)}`,
        );
      }
      setBusy(false);
      return navigate('/activities');
    }

    const result = await act(() =>
      createActivity(deps, {
        name,
        description: description || undefined,
        type,
        priority,
        checklist: checklistLines(),
        measurementRequirements: requirementList(),
        assetId: assetId ? (assetId as AssetId) : undefined,
        categoryId: categoryId ? (categoryId as CategoryId) : undefined,
        locationId: locationId ? (locationId as LocationId) : undefined,
        schedule: buildSchedule(),
      }),
    );
    if (result.ok && remind && repeat !== 'none') {
      const savedReminder = await saveReminder(result.value.activity.id);
      if (!savedReminder.ok) {
        setBusy(false);
        return setError(
          `The activity was created, but the reminder was not: ${describeError(savedReminder.error)}`,
        );
      }
    }
    setBusy(false);
    if (result.ok) navigate('/activities');
    else setError(describeError(result.error));
  }

  /** Saves the reminder choice. Nothing to do if there never was one and none is wanted. */
  async function saveReminder(activityId: ActivityId) {
    const wanted = remind && repeat !== 'none';
    const before = initial?.reminder;
    const unchanged =
      (before?.enabled ?? false) === wanted &&
      (!wanted || (String(before?.leadDays) === leadDays && before?.atTime === atTime));
    if (unchanged) return { ok: true as const };
    return act(() =>
      setActivityReminder(deps, {
        activityId,
        leadDays: Number(leadDays),
        atTime,
        enabled: wanted,
      }),
    );
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <h2 className="text-xl font-semibold">{editing ? 'Edit activity' : 'New activity'}</h2>

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

      <div className="flex flex-wrap gap-4">
        <CategorySelect label="Category" value={categoryId} onChange={setCategoryId} />
        <LocationSelect label="Place" value={locationId} onChange={setLocationId} />
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
          {initial?.schedule ? null : <option value="none">Does not repeat</option>}
          <option value="calendar">On a fixed calendar (e.g. every week)</option>
          <option value="after_completion">After I complete it (e.g. 30 days later)</option>
          {assetId ? <option value="usage">By usage (e.g. every 5,000 km)</option> : null}
        </select>
      </label>

      {editing && !sd.editable ? (
        <p className="rounded border border-line bg-canvas p-2 text-sm text-muted">
          This activity uses a schedule type that cannot be changed here. It is kept as it is.
        </p>
      ) : null}
      {initial?.schedule && sd.editable ? (
        <p className="text-sm text-muted">
          To stop an activity repeating, pause or archive it from the Activities list.
        </p>
      ) : null}

      {repeat !== 'none' && sd.editable ? (
        <fieldset className="space-y-3 card p-3">
          <legend className="px-1 text-sm font-medium">Schedule</legend>
          {repeat === 'usage' ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                Meter
                <input
                  required
                  value={meterKey}
                  onChange={(e) => setMeterKey(e.target.value)}
                  className="mt-1 block w-32 field"
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
                  className="mt-1 block w-28 field"
                />
              </label>
              <label className="block text-sm">
                Unit
                <input
                  required
                  value={meterUnit}
                  onChange={(e) => setMeterUnit(e.target.value)}
                  className="mt-1 block w-20 field"
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
                  className="mt-1 block w-20 field"
                />
              </label>
              <label className="block text-sm">
                Unit
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as RecurrenceUnit)}
                  className="mt-1 block field"
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
                className="mt-1 block field"
              />
            </label>
            <label className="block text-sm">
              Grace days
              <input
                type="number"
                min="0"
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
                className="mt-1 block w-24 field"
              />
            </label>
          </div>
          {initial?.schedule ? (
            <fieldset>
              <legend className="text-sm font-medium">Upcoming items already created</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="outstanding"
                  checked={outstanding === 'supersede_future'}
                  onChange={() => setOutstanding('supersede_future')}
                />
                <span>Update them to match the new schedule (overdue items are always kept)</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="outstanding"
                  checked={outstanding === 'keep_outstanding'}
                  onChange={() => setOutstanding('keep_outstanding')}
                />
                <span>Keep them as they are</span>
              </label>
            </fieldset>
          ) : null}
        </fieldset>
      ) : null}

      {repeat !== 'none' && sd.editable ? (
        <fieldset className="space-y-2 card p-3">
          <legend className="px-1 text-sm font-medium">Reminder</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
            Remind me
          </label>
          {remind ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                When
                <select
                  value={leadDays}
                  onChange={(e) => setLeadDays(e.target.value)}
                  className="mt-1 block field"
                >
                  <option value="0">On the day</option>
                  <option value="1">1 day before</option>
                  <option value="2">2 days before</option>
                  <option value="3">3 days before</option>
                  <option value="7">1 week before</option>
                </select>
              </label>
              <label className="block text-sm">
                At
                <input
                  type="time"
                  required
                  value={atTime}
                  onChange={(e) => setAtTime(e.target.value)}
                  className="mt-1 block field"
                />
              </label>
            </div>
          ) : null}
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Readings to record when done (optional)</legend>
        {requirements.map((r) => (
          <div key={r.rowKey} className="flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              Reading
              <input
                value={r.key}
                onChange={(e) =>
                  setRequirements(
                    requirements.map((x) => (x === r ? { ...x, key: e.target.value } : x)),
                  )
                }
                className="mt-1 block w-32 field"
              />
            </label>
            <label className="block text-sm">
              Unit
              <input
                value={r.unit}
                onChange={(e) =>
                  setRequirements(
                    requirements.map((x) => (x === r ? { ...x, unit: e.target.value } : x)),
                  )
                }
                className="mt-1 block w-20 field"
              />
            </label>
            <label className="flex items-center gap-1 pb-1 text-sm">
              <input
                type="checkbox"
                checked={r.required}
                onChange={(e) =>
                  setRequirements(
                    requirements.map((x) => (x === r ? { ...x, required: e.target.checked } : x)),
                  )
                }
              />
              Required
            </label>
            <button
              type="button"
              className="field text-sm hover:bg-sunken"
              onClick={() => setRequirements(requirements.filter((x) => x !== r))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={() =>
            setRequirements([
              ...requirements,
              { key: '', unit: '', required: false, rowKey: nextKey() },
            ])
          }
        >
          Add a reading
        </button>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {editing ? 'Save changes' : 'Create activity'}
        </button>
        {editing ? (
          <Link
            to="/activities"
            className="btn"
          >
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function ActivityFormPage() {
  return <ActivityForm />;
}

/** Loads one activity (and its schedule) and shows it in the form. */
export function ActivityEditPage() {
  const { activityId } = useParams();
  const loaded = useLiveQuery(async ({ repos }) => {
    const activity = activityId ? await repos.activities.getById(activityId as ActivityId) : null;
    if (!activity) return null;
    const schedule = (await repos.schedules.list()).find((x) => x.activityId === activity.id);
    return { activity, schedule, reminder: await getActivityReminder(repos, activity.id) };
  }, activityId ?? '');

  if (loaded.status === 'loading') return <p className="text-muted">Loading…</p>;
  if (loaded.status === 'error') {
    return (
      <p role="alert" className="text-danger">
        {loaded.message}
      </p>
    );
  }
  if (loaded.data === null) {
    return (
      <p role="alert" className="text-danger">
        That activity no longer exists.{' '}
        <Link to="/activities" className="underline">
          Back to activities
        </Link>
      </p>
    );
  }
  // Keyed so the form starts from the stored values once, and keeps what you type afterwards.
  return <ActivityForm key={activityId} initial={loaded.data} />;
}
