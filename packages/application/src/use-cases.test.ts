import { ConflictError } from '@tend/contracts';
import {
  createAsset,
  ok,
  type AssetId,
  type LocalDate,
  type Result,
  type ScheduleStrategy,
} from '@tend/domain';
import {
  archiveActivity,
  completeOccurrence,
  createActivity,
  pauseActivitySchedule,
  reconcileSchedules,
  recordMeasurement,
  rescheduleOccurrence,
  resumeActivitySchedule,
  skipOccurrence,
  snoozeOccurrence,
  transact,
  type CreateActivityInput,
} from './index';
import { createHarness, OWNER, type Harness } from './testing/harness';

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

const weekly: ScheduleStrategy = { kind: 'calendar', interval: { every: 1, unit: 'week' } };
const every30Days: ScheduleStrategy = {
  kind: 'completion_interval',
  interval: { every: 30, unit: 'day' },
};

const base = (extra: Partial<CreateActivityInput> = {}): CreateActivityInput => ({
  name: 'Clean AC filter',
  type: 'maintenance',
  schedule: { strategy: weekly, timeZone: 'Asia/Kolkata', startsOn: '2026-11-05' },
  ...extra,
});

describe('createActivity', () => {
  it('creates the activity, schedule and first batch of occurrences', async () => {
    const h = createHarness();
    const r = must(await createActivity(h.deps, base()));
    expect(r.activity.name).toBe('Clean AC filter');
    // Thursdays within the 30-day horizon: Nov 5, 12, 19, 26 and Dec 3.
    expect(r.occurrences.map((o) => o.dueOn)).toEqual([
      '2026-11-05',
      '2026-11-12',
      '2026-11-19',
      '2026-11-26',
      '2026-12-03',
    ]);
    expect(await h.repos.audit.list({})).toHaveLength(1);
  });

  it('works without a schedule (one-off activity)', async () => {
    const h = createHarness();
    const r = must(await createActivity(h.deps, base({ schedule: undefined })));
    expect(r.schedule).toBeUndefined();
    expect(r.occurrences).toEqual([]);
  });

  it('rolls everything back when the schedule is invalid', async () => {
    const h = createHarness();
    const r = await createActivity(
      h.deps,
      base({
        schedule: {
          strategy: { kind: 'calendar', interval: { every: 0, unit: 'day' } },
          timeZone: 'Asia/Kolkata',
          startsOn: '2026-11-05',
        },
      }),
    );
    expect(!r.ok && r.error.code).toBe('validation');
    expect(await h.repos.activities.list({ includeArchived: true })).toEqual([]);
    expect(await h.repos.audit.list({})).toEqual([]);
  });

  it('rejects a bad timezone and an unknown referenced asset', async () => {
    const h = createHarness();
    const bad = await createActivity(
      h.deps,
      base({ schedule: { strategy: weekly, timeZone: 'Mars/Base', startsOn: '2026-11-05' } }),
    );
    expect(!bad.ok && bad.error.issues[0]?.path).toBe('schedule.timeZone');

    const missing = await createActivity(
      h.deps,
      base({ assetId: '99999999-9999-4999-8999-999999999999' as AssetId }),
    );
    expect(!missing.ok && missing.error.code).toBe('not_found');
  });
});

describe('completeOccurrence', () => {
  it('records the completion and resolves the occurrence', async () => {
    const h = createHarness();
    const { occurrences } = must(await createActivity(h.deps, base()));
    const first = occurrences[0]!;

    const r = must(
      await completeOccurrence(h.deps, {
        occurrenceId: first.id,
        notes: ' done ',
        cost: { minor: 15000, currency: 'INR' },
      }),
    );
    expect(r.occurrence.status).toBe('completed');
    expect(r.completion.plannedFor).toBe('2026-11-05');
    expect(r.completion.notes).toBe('done');
    expect(r.completion.cost).toEqual({ minor: 15000, currency: 'INR' });
    // Calendar schedules already have their future occurrences, so nothing new appears.
    expect(r.nextOccurrences).toEqual([]);
  });

  it('refuses to complete the same occurrence twice', async () => {
    const h = createHarness();
    const { occurrences } = must(await createActivity(h.deps, base()));
    const id = occurrences[0]!.id;
    must(await completeOccurrence(h.deps, { occurrenceId: id }));
    const again = await completeOccurrence(h.deps, { occurrenceId: id });
    expect(!again.ok && again.error.code).toBe('invariant');
    expect(await h.repos.completions.list({})).toHaveLength(1);
  });

  it('returns not_found for an unknown occurrence', async () => {
    const h = createHarness();
    const r = await completeOccurrence(h.deps, {
      occurrenceId: '99999999-9999-4999-8999-999999999999' as never,
    });
    expect(!r.ok && r.error.code).toBe('not_found');
  });

  it('completion interval: next due follows the actual completion date, early or late', async () => {
    const h = createHarness();
    const { occurrences } = must(
      await createActivity(
        h.deps,
        base({
          schedule: { strategy: every30Days, timeZone: 'Asia/Kolkata', startsOn: '2026-11-05' },
        }),
      ),
    );
    expect(occurrences.map((o) => o.dueOn)).toEqual(['2026-11-05']);

    // Done two days early in practice: backdate the completion to Nov 3.
    const early = must(
      await completeOccurrence(h.deps, {
        occurrenceId: occurrences[0]!.id,
        completedAt: '2026-11-03T08:00:00.000Z',
      }),
    );
    expect(early.nextOccurrences.map((o) => o.dueOn)).toEqual(['2026-12-03']);

    // Completed late, on Dec 10.
    h.clock.set('2026-12-10T06:30:00.000Z');
    const late = must(
      await completeOccurrence(h.deps, { occurrenceId: early.nextOccurrences[0]!.id }),
    );
    expect(late.nextOccurrences.map((o) => o.dueOn)).toEqual(['2027-01-09']);
  });

  it('enforces required measurements and checklist items, leaving state untouched on failure', async () => {
    const h = createHarness();
    const { occurrences } = must(
      await createActivity(
        h.deps,
        base({
          checklist: ['Remove filter'],
          measurementRequirements: [{ key: 'airflow', unit: 'm3/h', required: true }],
        }),
      ),
    );
    const id = occurrences[0]!.id;

    const missing = await completeOccurrence(h.deps, { occurrenceId: id });
    expect(!missing.ok && missing.error.issues.map((i) => i.path)).toEqual(['measurements']);

    const wrongUnit = await completeOccurrence(h.deps, {
      occurrenceId: id,
      measurements: [{ kind: 'numeric', key: 'airflow', value: 300, unit: 'cfm' }],
    });
    expect(wrongUnit.ok).toBe(false);

    const unknownItem = await completeOccurrence(h.deps, {
      occurrenceId: id,
      measurements: [{ kind: 'numeric', key: 'airflow', value: 300, unit: 'm3/h' }],
      checklistResults: [{ itemId: '99999999-9999-4999-8999-999999999999' as never, done: true }],
    });
    expect(unknownItem.ok).toBe(false);

    expect((await h.repos.occurrences.getById(id))?.status).toBe('pending');
    expect(await h.repos.completions.list({})).toEqual([]);

    const good = must(
      await completeOccurrence(h.deps, {
        occurrenceId: id,
        measurements: [{ kind: 'numeric', key: 'airflow', value: 300, unit: 'm3/h' }],
      }),
    );
    expect(good.measurements).toHaveLength(1);
  });

  it('rejects a completion in the future', async () => {
    const h = createHarness();
    const { occurrences } = must(await createActivity(h.deps, base()));
    const r = await completeOccurrence(h.deps, {
      occurrenceId: occurrences[0]!.id,
      completedAt: '2026-11-06T00:00:00.000Z',
    });
    expect(!r.ok && r.error.code).toBe('validation');
  });
});

describe('skip, snooze and reschedule', () => {
  it('skipping restarts a completion interval from the skip date', async () => {
    const h = createHarness();
    const { occurrences } = must(
      await createActivity(
        h.deps,
        base({
          schedule: { strategy: every30Days, timeZone: 'Asia/Kolkata', startsOn: '2026-11-05' },
        }),
      ),
    );
    const r = must(
      await skipOccurrence(h.deps, { occurrenceId: occurrences[0]!.id, reason: 'away' }),
    );
    expect(r.occurrence.status).toBe('skipped');
    expect(r.nextOccurrences.map((o) => o.dueOn)).toEqual(['2026-12-05']);
  });

  it('snoozes to a later date and rejects bad input', async () => {
    const h = createHarness();
    const { occurrences } = must(await createActivity(h.deps, base()));
    const id = occurrences[0]!.id;
    expect(
      must(await snoozeOccurrence(h.deps, { occurrenceId: id, until: '2026-11-07' })).snoozedUntil,
    ).toBe('2026-11-07');
    const bad = await snoozeOccurrence(h.deps, { occurrenceId: id, until: 'tomorrow' });
    expect(!bad.ok && bad.error.code).toBe('validation');
  });

  it('reschedules, but not onto a date that already has an open occurrence', async () => {
    const h = createHarness();
    const { occurrences } = must(await createActivity(h.deps, base()));
    const [first, second] = [occurrences[0]!, occurrences[1]!];
    const clash = await rescheduleOccurrence(h.deps, { occurrenceId: first.id, to: second.dueOn });
    expect(!clash.ok && clash.error.code).toBe('invariant');
    expect(
      must(await rescheduleOccurrence(h.deps, { occurrenceId: first.id, to: '2026-11-08' })).dueOn,
    ).toBe('2026-11-08');
  });
});

describe('pause, resume and reconcile', () => {
  it('does not generate while paused and does not back-fill after resume', async () => {
    const h = createHarness();
    const { schedule } = must(await createActivity(h.deps, base()));
    must(await pauseActivitySchedule(h.deps, { scheduleId: schedule!.id }));

    h.clock.set('2027-02-01T06:30:00.000Z');
    expect(must(await reconcileSchedules(h.deps))).toEqual({ created: 0, superseded: 0 });

    must(await resumeActivitySchedule(h.deps, { scheduleId: schedule!.id }));
    const open = await h.repos.occurrences.list({
      status: ['pending'],
      dueFrom: '2027-01-01' as LocalDate,
    });
    // Thursdays from 2027-02-01 through 2027-03-03, none from the paused months.
    expect(open.map((o) => o.dueOn)).toEqual([
      '2027-02-04',
      '2027-02-11',
      '2027-02-18',
      '2027-02-25',
    ]);
  });

  it('consolidates a long absence into one overdue item, and is idempotent', async () => {
    const h = createHarness();
    must(await createActivity(h.deps, base()));

    h.clock.set('2026-12-20T06:30:00.000Z'); // every generated occurrence is now past due
    const first = must(await reconcileSchedules(h.deps));
    expect(first.superseded).toBe(4); // Nov 5, 12, 19, 26 superseded; Dec 3 stays as the overdue one
    expect(first.created).toBe(4); // Dec 24, 31, Jan 7, Jan 14

    const pending = await h.repos.occurrences.list({ status: ['pending'] });
    expect(pending[0]?.dueOn).toBe('2026-12-03');

    expect(must(await reconcileSchedules(h.deps))).toEqual({ created: 0, superseded: 0 });
  });
});

describe('usage-based maintenance', () => {
  async function carWithOilChange(h: Harness) {
    const asset = must(
      createAsset({
        id: h.deps.ids.next<'Asset'>(),
        ownerId: OWNER,
        now: h.clock.now(),
        name: 'Car',
      }),
    );
    await h.repos.assets.save(asset);
    const { activity } = must(
      await createActivity(h.deps, {
        name: 'Oil change',
        type: 'maintenance',
        assetId: asset.id,
        schedule: {
          strategy: { kind: 'usage', every: { value: 5000, unit: 'km' }, meterKey: 'odometer' },
          timeZone: 'Asia/Kolkata',
          startsOn: '2026-11-05',
        },
      }),
    );
    return { asset, activity };
  }

  const reading = (assetId: AssetId, value: number) => ({
    assetId,
    measurement: { kind: 'numeric' as const, key: 'odometer', value, unit: 'km' },
  });

  it('becomes due when the odometer advances, once, and resets after service', async () => {
    const h = createHarness();
    const { asset } = await carWithOilChange(h);

    // The first reading is the baseline, so nothing is due.
    expect(
      must(await recordMeasurement(h.deps, reading(asset.id, 40000))).createdOccurrences,
    ).toEqual([]);
    expect(
      must(await recordMeasurement(h.deps, reading(asset.id, 44000))).createdOccurrences,
    ).toEqual([]);

    const due = must(await recordMeasurement(h.deps, reading(asset.id, 45200)));
    expect(due.createdOccurrences).toHaveLength(1);

    // Another reading while one is open does not duplicate it.
    expect(
      must(await recordMeasurement(h.deps, reading(asset.id, 45400))).createdOccurrences,
    ).toEqual([]);

    const open = await h.repos.occurrences.list({ status: ['pending'] });
    must(
      await completeOccurrence(h.deps, {
        occurrenceId: open[0]!.id,
        measurements: [{ kind: 'numeric', key: 'odometer', value: 45400, unit: 'km' }],
      }),
    );

    // Service resets the baseline to 45,400: due again at 50,400.
    expect(
      must(await recordMeasurement(h.deps, reading(asset.id, 50000))).createdOccurrences,
    ).toEqual([]);
    expect(
      must(await recordMeasurement(h.deps, reading(asset.id, 50500))).createdOccurrences,
    ).toHaveLength(1);
  });

  it('ignores readings for a different meter or asset', async () => {
    const h = createHarness();
    const { asset } = await carWithOilChange(h);
    must(await recordMeasurement(h.deps, reading(asset.id, 40000)));
    const other = must(
      createAsset({
        id: h.deps.ids.next<'Asset'>(),
        ownerId: OWNER,
        now: h.clock.now(),
        name: 'Bike',
      }),
    );
    await h.repos.assets.save(other);
    expect(
      must(await recordMeasurement(h.deps, reading(other.id, 99999))).createdOccurrences,
    ).toEqual([]);
  });
});

describe('archiveActivity', () => {
  it('supersedes open occurrences, keeps history, and cannot be repeated', async () => {
    const h = createHarness();
    const { activity, occurrences } = must(await createActivity(h.deps, base()));
    must(await completeOccurrence(h.deps, { occurrenceId: occurrences[0]!.id }));

    const archived = must(await archiveActivity(h.deps, { activityId: activity.id }));
    expect(archived.archivedAt).toBeDefined();

    const all = await h.repos.occurrences.list({ activityId: activity.id });
    expect(all.filter((o) => o.status === 'superseded')).toHaveLength(4);
    expect(all.filter((o) => o.status === 'completed')).toHaveLength(1);
    expect(await h.repos.completions.list({ activityId: activity.id })).toHaveLength(1);

    const again = await archiveActivity(h.deps, { activityId: activity.id });
    expect(!again.ok && again.error.code).toBe('invariant');

    // Archived activities are not reconciled back to life.
    h.clock.set('2027-03-01T06:30:00.000Z');
    expect(must(await reconcileSchedules(h.deps))).toEqual({ created: 0, superseded: 0 });
  });
});

describe('transactions', () => {
  it('turns a stale-version save into a conflict error and rolls back', async () => {
    const h = createHarness();
    const { activity } = must(await createActivity(h.deps, base({ schedule: undefined })));

    const r = await transact(h.deps, async (repos) => {
      await repos.audit.add({
        id: h.deps.ids.next<'AuditEvent'>(),
        meta: activity.meta,
        entityType: 'probe',
        entityId: 'x',
        action: 'created',
        occurredAt: h.clock.now(),
      });
      await repos.activities.save(activity); // same version as stored: stale
      return ok(1);
    });
    expect(!r.ok && r.error.code).toBe('conflict');
    expect(await h.repos.audit.list({})).toHaveLength(1); // only the creation event survived
  });

  it('rolls back writes when a use case returns an error', async () => {
    const h = createHarness();
    const r = await transact(h.deps, async (repos) => {
      await repos.audit.add({
        id: h.deps.ids.next<'AuditEvent'>(),
        meta: { ownerId: OWNER, createdAt: h.clock.now(), updatedAt: h.clock.now(), version: 1 },
        entityType: 'probe',
        entityId: 'x',
        action: 'created',
        occurredAt: h.clock.now(),
      });
      return {
        ok: false as const,
        error: { code: 'invariant' as const, message: 'no', issues: [] },
      };
    });
    expect(r.ok).toBe(false);
    expect(await h.repos.audit.list({})).toEqual([]);
  });

  it('exposes ConflictError from the contracts for repository implementers', () => {
    expect(new ConflictError('x')).toBeInstanceOf(Error);
  });
});
