import {
  completeOccurrence,
  createActivity,
  getHistory,
  reconcileSchedules,
  skipOccurrence,
  recordMeasurement,
  transact,
  type Deps,
} from '@tend/application';
import type { Repositories } from '@tend/contracts';
import { ConflictError } from '@tend/contracts';
import {
  createActivity as buildActivity,
  createAsset,
  createCompletion,
  createMeasurement,
  newMeta,
  ok,
  touch,
  type Activity,
  type ActivityId,
  type AssetId,
  type Clock,
  type Id,
  type IdGenerator,
  type Instant,
  type LocalDate,
  type Occurrence,
  type OccurrenceId,
  type Result,
  type Schedule,
  type ScheduleId,
  type TimeZoneId,
  type UserId,
} from '@tend/domain';
import { createSqlRepositories, createSqlUnitOfWork } from './sql-repositories';
import { createNodeSqliteDatabase } from './testing/node-sqlite';

const OWNER = '11111111-1111-4111-8111-111111111111' as UserId;

class TestClock implements Clock {
  constructor(private t: string) {}
  now(): Instant {
    return this.t as Instant;
  }
  set(t: string): void {
    this.t = t;
  }
}

function setup(now = '2026-11-05T06:30:00.000Z') {
  const db = createNodeSqliteDatabase();
  let n = 0;
  const ids: IdGenerator = {
    next<K extends string>(): Id<K> {
      n += 1;
      return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as Id<K>;
    },
  };
  const clock = new TestClock(now);
  const deps: Deps = { ownerId: OWNER, clock, ids, uow: createSqlUnitOfWork(db) };
  return { db, repos: createSqlRepositories(db), deps, clock, ids };
}

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe('SQL repositories: round trips', () => {
  it('stores and reloads an activity with every field', async () => {
    const { repos, ids } = setup();
    const activity = must(
      buildActivity({
        id: ids.next<'Activity'>(),
        ownerId: OWNER,
        now: '2026-11-05T06:30:00.000Z' as Instant,
        name: 'Descale kettle',
        description: 'Use citric acid',
        type: 'cleaning',
        priority: 'high',
        estimatedMinutes: 20,
        checklist: [{ id: ids.next<'ChecklistItem'>(), label: 'Rinse twice' }],
        measurementRequirements: [{ key: 'tds', unit: 'ppm', required: false }],
      }),
    );
    await repos.activities.save(activity);
    expect(await repos.activities.getById(activity.id)).toEqual(activity);
  });

  it('stores and reloads an asset with purchase and warranty', async () => {
    const { repos, ids } = setup();
    const asset = must(
      createAsset({
        id: ids.next<'Asset'>(),
        ownerId: OWNER,
        now: '2026-11-05T06:30:00.000Z' as Instant,
        name: 'Monitor',
        purchase: {
          date: '2026-01-10' as LocalDate,
          price: { minor: 2499900, currency: 'INR' },
          vendor: 'Croma',
        },
        warranty: { expiresOn: '2029-01-10' as LocalDate, notes: 'On-site' },
        notes: 'Desk',
      }),
    );
    await repos.assets.save(asset);
    expect(await repos.assets.getById(asset.id)).toEqual(asset);
  });

  it('stores and reloads every schedule strategy as JSON', async () => {
    const { repos, ids } = setup();
    const strategies: Schedule['strategy'][] = [
      {
        kind: 'calendar',
        interval: { every: 2, unit: 'week' },
        byWeekday: [1, 4],
        byMonthDay: undefined,
      },
      { kind: 'completion_interval', interval: { every: 30, unit: 'day' } },
      { kind: 'usage', every: { value: 5000, unit: 'km' }, meterKey: 'odometer' },
    ];
    for (const strategy of strategies) {
      const schedule: Schedule = {
        id: ids.next<'Schedule'>() as ScheduleId,
        meta: newMeta(OWNER, '2026-11-05T06:30:00.000Z' as Instant),
        activityId: ids.next<'Activity'>() as ActivityId,
        strategy,
        policy: { graceDays: 3 },
        timeZone: 'Asia/Kolkata' as TimeZoneId,
        startsOn: '2026-11-05' as LocalDate,
        endsOn: undefined,
        pausedAt: undefined,
      };
      await repos.schedules.save(schedule);
      const loaded = await repos.schedules.getById(schedule.id);
      expect(loaded?.policy).toEqual({ graceDays: 3 });
      expect(loaded?.strategy.kind).toBe(strategy.kind);
      expect(JSON.parse(JSON.stringify(loaded?.strategy))).toEqual(
        JSON.parse(JSON.stringify(strategy)),
      );
    }
  });

  it('stores completions with cost and measurements of both kinds', async () => {
    const { repos, ids } = setup();
    const now = '2026-11-05T06:30:00.000Z' as Instant;
    const completion = must(
      createCompletion({
        id: ids.next<'Completion'>(),
        ownerId: OWNER,
        now,
        activityId: ids.next<'Activity'>(),
        cost: { minor: 15000, currency: 'INR' },
        notes: 'ok',
        plannedFor: '2026-11-05' as LocalDate,
        checklistResults: [{ itemId: ids.next<'ChecklistItem'>(), done: true }],
      }),
    );
    await repos.completions.add(completion);
    expect(await repos.completions.getById(completion.id)).toEqual(completion);

    const assetId = ids.next<'Asset'>() as AssetId;
    const numeric = must(
      createMeasurement({
        id: ids.next<'Measurement'>(),
        ownerId: OWNER,
        now,
        key: 'odometer',
        value: { kind: 'numeric', quantity: { value: 42000.5, unit: 'km' } },
        assetId,
      }),
    );
    const qualitative = must(
      createMeasurement({
        id: ids.next<'Measurement'>(),
        ownerId: OWNER,
        now,
        key: 'condition',
        value: { kind: 'qualitative', label: 'good' },
        assetId,
      }),
    );
    await repos.measurements.add(numeric);
    await repos.measurements.add(qualitative);
    const listed = await repos.measurements.list({ assetId });
    expect(listed).toHaveLength(2);
    expect(listed).toEqual(expect.arrayContaining([numeric, qualitative]));
  });
});

describe('SQL repositories: versioning and append-only', () => {
  async function savedActivity() {
    const ctx = setup();
    const activity = must(
      buildActivity({
        id: ctx.ids.next<'Activity'>(),
        ownerId: OWNER,
        now: '2026-11-05T06:30:00.000Z' as Instant,
        name: 'Wipe desk',
        type: 'cleaning',
      }),
    );
    await ctx.repos.activities.save(activity);
    return { ...ctx, activity };
  }

  it('accepts the next version and rejects a stale one', async () => {
    const { repos, activity } = await savedActivity();
    const later = '2026-11-06T06:30:00.000Z' as Instant;
    const v2: Activity = { ...activity, name: 'Wipe desks', meta: touch(activity.meta, later) };
    await repos.activities.save(v2);
    expect((await repos.activities.getById(activity.id))?.name).toBe('Wipe desks');

    const staleEdit: Activity = { ...activity, name: 'Other', meta: touch(activity.meta, later) };
    await expect(repos.activities.save(staleEdit)).rejects.toBeInstanceOf(ConflictError);
    expect((await repos.activities.getById(activity.id))?.name).toBe('Wipe desks');
  });

  it('ignores a repeated append of the same completion id', async () => {
    const { repos, ids } = setup();
    const completion = must(
      createCompletion({
        id: ids.next<'Completion'>(),
        ownerId: OWNER,
        now: '2026-11-05T06:30:00.000Z' as Instant,
        activityId: ids.next<'Activity'>(),
        notes: 'first',
      }),
    );
    await repos.completions.add(completion);
    await repos.completions.add({ ...completion, notes: 'second' });
    expect(await repos.completions.list({})).toHaveLength(1);
    expect((await repos.completions.getById(completion.id))?.notes).toBe('first');
  });

  it('deletes', async () => {
    const { repos, activity } = await savedActivity();
    await repos.activities.delete(activity.id);
    expect(await repos.activities.getById(activity.id)).toBeNull();
  });
});

describe('SQL repositories: queries', () => {
  async function seededActivities() {
    const ctx = setup();
    const now = '2026-11-05T06:30:00.000Z' as Instant;
    const make = async (name: string, type: Activity['type'], archived = false) => {
      const a = must(
        buildActivity({ id: ctx.ids.next<'Activity'>(), ownerId: OWNER, now, name, type }),
      );
      await ctx.repos.activities.save(archived ? { ...a, archivedAt: now } : a);
      return a;
    };
    await make('Clean AC filter', 'maintenance');
    await make('100% battery check', 'inspection');
    await make('snake_case chore', 'routine');
    await make('Old task', 'routine', true);
    return ctx;
  }

  it('searches literally (wildcards in the text are not wildcards), case-insensitively', async () => {
    const { repos } = await seededActivities();
    expect((await repos.activities.list({ search: '100%' })).map((a) => a.name)).toEqual([
      '100% battery check',
    ]);
    expect((await repos.activities.list({ search: 'e_c' })).map((a) => a.name)).toEqual([
      'snake_case chore',
    ]);
    expect((await repos.activities.list({ search: 'ac FILTER' })).map((a) => a.name)).toEqual([
      'Clean AC filter',
    ]);
  });

  it('hides archived activities unless asked, filters by type, and pages', async () => {
    const { repos } = await seededActivities();
    expect(await repos.activities.list({})).toHaveLength(3);
    expect(await repos.activities.list({ includeArchived: true })).toHaveLength(4);
    expect((await repos.activities.list({ type: 'routine' })).map((a) => a.name)).toEqual([
      'snake_case chore',
    ]);
    const page = await repos.activities.list({ limit: 2, offset: 1 });
    expect(page.map((a) => a.name)).toEqual(['Clean AC filter', 'snake_case chore']);
    expect(await repos.activities.list({ offset: 2 })).toHaveLength(1);
  });

  it('filters, orders and pages occurrences', async () => {
    const { repos, ids } = setup();
    const activityId = ids.next<'Activity'>() as ActivityId;
    const now = '2026-11-05T06:30:00.000Z' as Instant;
    const dates = ['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26'];
    const statuses = ['pending', 'completed', 'pending', 'skipped'] as const;
    for (const [i, due] of dates.entries()) {
      const o: Occurrence = {
        id: ids.next<'Occurrence'>() as OccurrenceId,
        meta: newMeta(OWNER, now),
        activityId,
        dueOn: due as LocalDate,
        status: statuses[i] ?? 'pending',
      };
      await repos.occurrences.save(o);
    }
    const due = (list: Occurrence[]) => list.map((o) => o.dueOn);

    expect(due(await repos.occurrences.list({ status: ['pending'] }))).toEqual([
      '2026-11-05',
      '2026-11-19',
    ]);
    expect(
      due(await repos.occurrences.list({ status: ['completed', 'skipped'], order: 'due_desc' })),
    ).toEqual(['2026-11-26', '2026-11-12']);
    expect(
      due(
        await repos.occurrences.list({
          dueFrom: '2026-11-10' as LocalDate,
          dueTo: '2026-11-20' as LocalDate,
        }),
      ),
    ).toEqual(['2026-11-12', '2026-11-19']);
    expect(due(await repos.occurrences.list({ order: 'due_desc', limit: 1 }))).toEqual([
      '2026-11-26',
    ]);
    expect(await repos.occurrences.list({ status: [] })).toEqual([]);
  });

  it('lists completions newest first', async () => {
    const { repos, ids } = setup();
    const activityId = ids.next<'Activity'>();
    for (const day of ['02', '09', '05']) {
      await repos.completions.add(
        must(
          createCompletion({
            id: ids.next<'Completion'>(),
            ownerId: OWNER,
            now: '2026-11-10T00:00:00.000Z' as Instant,
            activityId,
            completedAt: `2026-11-${day}T08:00:00.000Z` as Instant,
          }),
        ),
      );
    }
    expect(
      (await repos.completions.list({ limit: 2 })).map((c) => c.completedAt.slice(8, 10)),
    ).toEqual(['09', '05']);
  });
});

describe('SQL unit of work', () => {
  const probe = (repos: Repositories, deps: Deps) =>
    repos.audit.add({
      id: deps.ids.next<'AuditEvent'>(),
      meta: newMeta(OWNER, deps.clock.now()),
      entityType: 'probe',
      entityId: 'x',
      action: 'created',
      occurredAt: deps.clock.now(),
    });

  it('rolls back every write when a use case returns an error', async () => {
    const { repos, deps } = setup();
    const r = await transact(deps, async (tx) => {
      await probe(tx, deps);
      return {
        ok: false as const,
        error: { code: 'invariant' as const, message: 'no', issues: [] },
      };
    });
    expect(r.ok).toBe(false);
    expect(await repos.audit.list({})).toEqual([]);
  });

  it('commits on success and turns a stale save into a conflict, rolling back', async () => {
    const { repos, deps } = setup();
    must(await createActivity(deps, { name: 'One-off', type: 'routine' }));
    const [activity] = await repos.activities.list({});

    const r = await transact(deps, async (tx) => {
      await probe(tx, deps);
      await tx.activities.save(activity!); // same version as stored: stale
      return ok(1);
    });
    expect(!r.ok && r.error.code).toBe('conflict');
    expect(await repos.audit.list({})).toHaveLength(1); // only the creation event
  });
});

describe('application use cases against SQL', () => {
  const weekly = { kind: 'calendar', interval: { every: 1, unit: 'week' } } as const;

  it('creates, completes and reconciles a weekly activity', async () => {
    const { repos, deps, clock } = setup();
    const created = must(
      await createActivity(deps, {
        name: 'Clean AC filter',
        type: 'maintenance',
        schedule: { strategy: weekly, timeZone: 'Asia/Kolkata', startsOn: '2026-11-05' },
      }),
    );
    expect(created.occurrences).toHaveLength(5);

    const done = must(
      await completeOccurrence(deps, {
        occurrenceId: created.occurrences[0]!.id,
        cost: { minor: 15000, currency: 'INR' },
      }),
    );
    expect(done.completion.cost).toEqual({ minor: 15000, currency: 'INR' });
    expect(await repos.completions.list({ activityId: created.activity.id })).toHaveLength(1);

    clock.set('2026-12-20T06:30:00.000Z');
    const first = must(await reconcileSchedules(deps));
    expect(first).toEqual({ created: 4, superseded: 3 }); // Nov 12, 19, 26 superseded; Dec 3 stays
    expect(must(await reconcileSchedules(deps))).toEqual({ created: 0, superseded: 0 });
  });

  it('detects usage-based maintenance from odometer readings', async () => {
    const { repos, deps, clock, ids } = setup();
    const asset = must(
      createAsset({ id: ids.next<'Asset'>(), ownerId: OWNER, now: clock.now(), name: 'Car' }),
    );
    await repos.assets.save(asset);
    must(
      await createActivity(deps, {
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

    const reading = async (value: number, at: string) => {
      clock.set(at);
      return must(
        await recordMeasurement(deps, {
          assetId: asset.id,
          measurement: { kind: 'numeric', key: 'odometer', value, unit: 'km' },
        }),
      ).createdOccurrences.length;
    };

    expect(await reading(40000, '2026-11-05T06:30:00.000Z')).toBe(0); // baseline
    expect(await reading(44000, '2026-11-06T06:30:00.000Z')).toBe(0);
    expect(await reading(45200, '2026-11-07T06:30:00.000Z')).toBe(1);
    expect(await reading(45400, '2026-11-08T06:30:00.000Z')).toBe(0); // one open at a time

    const [open] = await repos.occurrences.list({ status: ['pending'] });
    clock.set('2026-11-08T07:30:00.000Z');
    must(
      await completeOccurrence(deps, {
        occurrenceId: open!.id,
        measurements: [{ kind: 'numeric', key: 'odometer', value: 45400, unit: 'km' }],
      }),
    );
    expect(await reading(50000, '2026-11-09T06:30:00.000Z')).toBe(0);
    expect(await reading(50500, '2026-11-10T06:30:00.000Z')).toBe(1);
  });
});

describe('history over SQL', () => {
  it('returns completions and skips newest first, with paging', async () => {
    const { deps, repos, clock } = setup();
    const created = must(
      await createActivity(deps, {
        name: 'Daily chore',
        type: 'routine',
        schedule: {
          strategy: { kind: 'calendar', interval: { every: 1, unit: 'day' } },
          timeZone: 'Asia/Kolkata',
          startsOn: '2026-11-05',
        },
      }),
    );
    must(
      await completeOccurrence(deps, {
        occurrenceId: created.occurrences[0]!.id,
        cost: { minor: 1234, currency: 'KWD' },
        measurements: [],
      }),
    );
    clock.set('2026-11-06T06:30:00.000Z');
    must(await skipOccurrence(deps, { occurrenceId: created.occurrences[1]!.id }));

    const all = await getHistory(repos, { timeZone: 'Asia/Kolkata' as TimeZoneId });
    expect(all.entries.map((e) => e.kind)).toEqual(['skipped', 'completed']);
    const done = all.entries[1];
    expect(done?.kind === 'completed' && done.completion.cost).toEqual({
      minor: 1234,
      currency: 'KWD',
    });

    const page = await getHistory(repos, { timeZone: 'Asia/Kolkata' as TimeZoneId, limit: 1 });
    expect(page.entries).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });
});
