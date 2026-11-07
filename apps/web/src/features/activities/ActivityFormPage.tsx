import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  createActivity,
  ensureCategory,
  findPreset,
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
  type LocalDate,
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
import { CategorySelect, LocationSelect } from '../../shared/ui/pickers';

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

type Repeat =
  | 'none'
  | 'calendar'
  | 'fixed_interval'
  | 'after_completion'
  | 'usage'
  | 'after_activity'
  | 'when_reading';
type Comparator = 'gt' | 'gte' | 'lt' | 'lte';

const field = 'field mt-1 block w-full max-w-md';

/** What the form shows for a stored schedule. Types the form cannot express are left untouched. */
function scheduleDefaults(schedule: Schedule | undefined) {
  const s = schedule?.strategy;
  return {
    editable:
      !s ||
      s.kind === 'calendar' ||
      s.kind === 'fixed_interval' ||
      s.kind === 'completion_interval' ||
      s.kind === 'usage' ||
      s.kind === 'event' ||
      s.kind === 'condition',
    repeat: (!s
      ? 'none'
      : s.kind === 'calendar'
        ? 'calendar'
        : s.kind === 'fixed_interval'
          ? 'fixed_interval'
          : s.kind === 'completion_interval'
            ? 'after_completion'
            : s.kind === 'usage'
              ? 'usage'
              : s.kind === 'event'
                ? 'after_activity'
                : s.kind === 'condition'
                  ? 'when_reading'
                  : 'none') as Repeat,
    readingKey: s?.kind === 'condition' ? s.measurementKey : '',
    comparator: (s?.kind === 'condition' ? s.comparator : 'gt') as Comparator,
    threshold: s?.kind === 'condition' ? String(s.threshold) : '',
    afterActivityId: s?.kind === 'event' ? s.afterActivityId : '',
    delayDays: s?.kind === 'event' ? String(s.delayDays) : '7',
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

/** The next date on or after `today` that falls on this month and day. */
function nextSeasonStart(today: LocalDate, season: { month: number; day: number }): LocalDate {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${pad(season.month)}-${pad(season.day)}` as LocalDate;
  return thisYear >= today
    ? thisYear
    : (`${year + 1}-${pad(season.month)}-${pad(season.day)}` as LocalDate);
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
  const [searchParams] = useSearchParams();
  const preset = initial ? undefined : findPreset(searchParams.get('preset'));
  const sd = scheduleDefaults(initial?.schedule);
  const original = initial?.activity;

  const [name, setName] = useState(original?.name ?? preset?.name ?? '');
  const [description, setDescription] = useState(
    original?.description ?? preset?.description ?? '',
  );
  const [type, setType] = useState<ActivityType>(original?.type ?? preset?.type ?? 'routine');
  const [priority, setPriority] = useState<Priority>(original?.priority ?? 'normal');
  const [repeat, setRepeat] = useState<Repeat>(preset?.repeat ?? sd.repeat);
  const [dueOn, setDueOn] = useState('');
  const [every, setEvery] = useState(preset ? String(preset.every) : sd.every);
  const [unit, setUnit] = useState<RecurrenceUnit>(preset?.unit ?? sd.unit);
  const [weekdays, setWeekdays] = useState<IsoWeekday[]>(sd.weekdays);
  const [startsOn, setStartsOn] = useState(() => {
    const today = localDateOf(deps.clock.now(), deviceTimeZone());
    return sd.startsOn ?? (preset?.season ? nextSeasonStart(today, preset.season) : today);
  });
  const [graceDays, setGraceDays] = useState(
    preset?.graceDays === undefined ? sd.graceDays : String(preset.graceDays),
  );
  const [checklist, setChecklist] = useState(
    original?.checklist.map((c) => c.label).join('\n') ?? preset?.checklist.join('\n') ?? '',
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
  const [remind, setRemind] = useState(initial?.reminder?.enabled ?? preset?.remind ?? false);
  const [leadDays, setLeadDays] = useState(
    String(initial?.reminder?.leadDays ?? preset?.leadDays ?? 0),
  );
  const [atTime, setAtTime] = useState(initial?.reminder?.atTime ?? '09:00');
  const [afterActivityId, setAfterActivityId] = useState<string>(sd.afterActivityId);
  const [delayDays, setDelayDays] = useState(sd.delayDays);
  const [readingKey, setReadingKey] = useState(sd.readingKey);
  const [comparator, setComparator] = useState<Comparator>(sd.comparator);
  const [threshold, setThreshold] = useState(sd.threshold);
  const assets = useLiveQuery(({ repos }) => listAssets(repos));
  const otherActivities = useLiveQuery(async ({ repos }) =>
    (await repos.activities.list({})).filter((a) => a.id !== original?.id),
  );
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
        : repeat === 'when_reading'
          ? {
              kind: 'condition',
              measurementKey: readingKey.trim(),
              comparator,
              threshold: Number(threshold),
            }
          : repeat === 'after_activity'
            ? {
                kind: 'event',
                afterActivityId: afterActivityId as ActivityId,
                delayDays: Number(delayDays),
              }
            : repeat === 'fixed_interval'
              ? { kind: 'fixed_interval', interval, anchor: startsOn as LocalDate }
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
    if (st.kind === 'fixed_interval') {
      // The form anchors a fixed interval on its start date.
      return { ...base, strategy: { ...st, anchor: stored.startsOn } };
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

    let newCategoryId = categoryId ? (categoryId as CategoryId) : undefined;
    if (preset?.category && !newCategoryId) {
      const digital = await act(() => ensureCategory(deps, preset.category!));
      if (!digital.ok) {
        setBusy(false);
        return setError(describeError(digital.error));
      }
      newCategoryId = digital.value.id;
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
        categoryId: newCategoryId,
        locationId: locationId ? (locationId as LocationId) : undefined,
        schedule: buildSchedule(),
        dueOn: repeat === 'none' && dueOn ? dueOn : undefined,
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
    if (result.ok) navigate(preset ? `/${preset.group}` : '/activities');
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
      <h2 className="text-2xl font-semibold">{editing ? 'Edit activity' : 'New activity'}</h2>

      <label className="block text-sm">
        Name
        <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>

      {preset ? (
        <p className="rounded border border-line bg-canvas p-2 text-sm text-muted">
          Started from “{preset.label}”.
          {preset.category
            ? ` It will be filed under ${preset.category} unless you pick another category.`
            : ''}
          {preset.group === 'digital'
            ? ' Don’t store passwords, authentication secrets or recovery codes here.'
            : ''}
        </p>
      ) : null}

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
          <option value="fixed_interval">
            Every N units from a date, regardless of completion
          </option>
          <option value="after_completion">After I complete it (e.g. 30 days later)</option>
          {assetId ? <option value="usage">By usage (e.g. every 5,000 km)</option> : null}
          {(otherActivities.status === 'ready' && otherActivities.data.length > 0) ||
          repeat === 'after_activity' ? (
            <option value="after_activity">After another activity is completed</option>
          ) : null}
          <option value="when_reading">When a reading crosses a limit (e.g. pH above 7.5)</option>
        </select>
      </label>

      {repeat === 'none' && !editing ? (
        <label className="block text-sm">
          Due on (optional)
          <input
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            className="mt-1 block field"
          />
          <span className="mt-1 block text-muted">
            Leave it empty to keep it as planned; you can give it a date later from the Activities
            list.
          </span>
        </label>
      ) : null}

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
          ) : repeat === 'when_reading' ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                Reading
                <input
                  required
                  value={readingKey}
                  onChange={(e) => setReadingKey(e.target.value)}
                  className="mt-1 block w-32 field"
                />
              </label>
              <label className="block text-sm">
                Becomes
                <select
                  value={comparator}
                  onChange={(e) => setComparator(e.target.value as Comparator)}
                  className="mt-1 block field"
                >
                  <option value="gt">above</option>
                  <option value="gte">at or above</option>
                  <option value="lt">below</option>
                  <option value="lte">at or below</option>
                </select>
              </label>
              <label className="block text-sm">
                Limit
                <input
                  required
                  type="number"
                  step="any"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="mt-1 block w-28 field"
                />
              </label>
            </div>
          ) : repeat === 'after_activity' ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                After completing
                <select
                  required
                  value={afterActivityId}
                  onChange={(e) => setAfterActivityId(e.target.value)}
                  className="mt-1 block field"
                >
                  <option value="">Choose an activity…</option>
                  {otherActivities.status === 'ready'
                    ? otherActivities.data.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))
                    : null}
                </select>
              </label>
              <label className="block text-sm">
                Due after (days)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={delayDays}
                  onChange={(e) => setDelayDays(e.target.value)}
                  className="mt-1 block w-24 field"
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
          <Link to="/activities" className="btn">
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
