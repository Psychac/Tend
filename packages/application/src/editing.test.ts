import type { Result } from '@upkeep/domain';
import {
  archiveActivity,
  completeOccurrence,
  createActivity,
  createAsset,
  listActivities,
  setActivitySchedule,
  setAssetStatus,
  unarchiveActivity,
  updateActivity,
  updateAsset,
} from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

const weekly = {
  strategy: { kind: 'calendar', interval: { every: 1, unit: 'week' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05',
} as const;
const daily = {
  strategy: { kind: 'calendar', interval: { every: 1, unit: 'day' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05',
} as const;

describe('updateActivity', () => {
  it('changes details, keeps history and identity, and bumps the version', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Clean AC fliter',
        type: 'maintenance',
        checklist: ['Remove filter', 'Rinse'],
        schedule: weekly,
      }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));

    h.clock.set('2026-11-06T06:30:00.000Z');
    const kept = a.activity.checklist[0]!;
    const updated = must(
      await updateActivity(h.deps, {
        activityId: a.activity.id,
        name: 'Clean AC filter',
        type: 'cleaning',
        priority: 'high',
        checklist: [{ id: kept.id, label: 'Take out filter' }, { label: 'Dry' }],
      }),
    );
    expect(updated.name).toBe('Clean AC filter');
    expect(updated.type).toBe('cleaning');
    expect(updated.priority).toBe('high');
    expect(updated.meta.version).toBe(a.activity.meta.version + 1);
    expect(updated.meta.createdAt).toBe(a.activity.meta.createdAt);
    // The kept item keeps its id (so old checklist results still match); the new one gets its own.
    expect(updated.checklist[0]).toEqual({ id: kept.id, label: 'Take out filter' });
    expect(updated.checklist[1]?.id).not.toBe(a.activity.checklist[1]?.id);
    // History is untouched.
    expect(await h.repos.completions.list({ activityId: a.activity.id })).toHaveLength(1);
  });

  it('explains invalid edits and changes nothing', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'Chore', type: 'routine' }));
    const bad = await updateActivity(h.deps, {
      activityId: a.activity.id,
      name: ' ',
      type: 'routine',
    });
    expect(!bad.ok && bad.error.issues[0]?.path).toBe('name');
    expect((await h.repos.activities.getById(a.activity.id))?.name).toBe('Chore');
  });

  it('ignores a checklist id that does not belong to the activity', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', checklist: ['One'] }),
    );
    const updated = must(
      await updateActivity(h.deps, {
        activityId: a.activity.id,
        name: 'Chore',
        type: 'routine',
        checklist: [{ id: 'foreign-id', label: 'One' }],
      }),
    );
    expect(updated.checklist[0]?.id).not.toBe('foreign-id');
  });

  it('can link and unlink an asset, and rejects one that does not exist', async () => {
    const h = createHarness();
    const car = must(await createAsset(h.deps, { name: 'Car' }));
    const a = must(await createActivity(h.deps, { name: 'Oil change', type: 'maintenance' }));
    const base = { activityId: a.activity.id, name: 'Oil change', type: 'maintenance' } as const;

    expect(must(await updateActivity(h.deps, { ...base, assetId: car.id })).assetId).toBe(car.id);
    expect(must(await updateActivity(h.deps, base)).assetId).toBeUndefined();

    const missing = await updateActivity(h.deps, {
      ...base,
      assetId: '99999999-9999-4999-8999-999999999999' as never,
    });
    expect(!missing.ok && missing.error.code).toBe('not_found');
  });

  it('does not unarchive by editing', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'Old', type: 'routine' }));
    must(await archiveActivity(h.deps, { activityId: a.activity.id }));
    const edited = must(
      await updateActivity(h.deps, { activityId: a.activity.id, name: 'Older', type: 'routine' }),
    );
    expect(edited.archivedAt).toBeDefined();
  });
});

describe('unarchiveActivity', () => {
  it('restores the activity and refills its upcoming work', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    must(await archiveActivity(h.deps, { activityId: a.activity.id }));
    expect(await listActivities(h.repos)).toHaveLength(0);

    must(await unarchiveActivity(h.deps, { activityId: a.activity.id }));
    const [item] = await listActivities(h.repos);
    expect(item?.nextDueOn).toBe('2026-11-05');
    const again = await unarchiveActivity(h.deps, { activityId: a.activity.id });
    expect(!again.ok && again.error.code).toBe('invariant');
  });
});

describe('setActivitySchedule', () => {
  it('replaces upcoming work the new schedule would not produce, keeping history', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: weekly }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));

    const result = must(
      await setActivitySchedule(h.deps, {
        activityId: a.activity.id,
        schedule: { ...daily, graceDays: 2 },
      }),
    );
    expect(result.schedule.id).toBe(a.schedule!.id); // same schedule, edited
    expect(result.schedule.policy.graceDays).toBe(2);
    expect(result.created).toBeGreaterThan(0);

    const outstanding = await h.repos.occurrences.list({ status: ['pending', 'snoozed'] });
    const dates = outstanding.map((o) => o.dueOn);
    expect(new Set(dates).size).toBe(dates.length); // no duplicates
    expect(dates).toContain('2026-11-06');
    expect(await h.repos.completions.list({ activityId: a.activity.id })).toHaveLength(1);
  });

  it('supersedes weekly occurrences that a monthly schedule would not produce', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: weekly }),
    );
    const result = must(
      await setActivitySchedule(h.deps, {
        activityId: a.activity.id,
        schedule: {
          ...weekly,
          strategy: { kind: 'calendar', interval: { every: 1, unit: 'month' } },
        },
      }),
    );
    expect(result.superseded).toBeGreaterThan(0);
    const open = await h.repos.occurrences.list({ status: ['pending'] });
    expect(open.map((o) => o.dueOn)).not.toContain('2026-11-12');
  });

  it('keep_outstanding leaves existing upcoming work alone', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: weekly }),
    );
    const result = must(
      await setActivitySchedule(h.deps, {
        activityId: a.activity.id,
        schedule: {
          ...weekly,
          strategy: { kind: 'calendar', interval: { every: 2, unit: 'week' } },
        },
        outstanding: 'keep_outstanding',
      }),
    );
    expect(result.superseded).toBe(0);
    const open = await h.repos.occurrences.list({ status: ['pending'] });
    expect(open.map((o) => o.dueOn)).toContain('2026-11-12'); // the old weekly one is still there
  });

  it('is a no-op when nothing changes', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: weekly }),
    );
    const result = must(
      await setActivitySchedule(h.deps, { activityId: a.activity.id, schedule: weekly }),
    );
    expect(result).toMatchObject({ created: 0, superseded: 0 });
  });

  it('adds a schedule to an activity that had none', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'One-off', type: 'routine' }));
    const result = must(
      await setActivitySchedule(h.deps, { activityId: a.activity.id, schedule: weekly }),
    );
    expect(result.created).toBeGreaterThan(0);
    expect((await listActivities(h.repos))[0]?.schedules).toHaveLength(1);
  });

  it('keeps overdue work when the schedule changes', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: weekly }),
    );
    h.clock.set('2026-11-20T06:30:00.000Z'); // Nov 5 and 12 are now past due
    must(
      await setActivitySchedule(h.deps, {
        activityId: a.activity.id,
        schedule: {
          ...weekly,
          startsOn: '2026-11-20',
          strategy: { kind: 'calendar', interval: { every: 1, unit: 'month' } },
        },
      }),
    );
    const open = await h.repos.occurrences.list({ status: ['pending'] });
    expect(open.map((o) => o.dueOn)).toContain('2026-11-05');
  });

  it('rejects invalid schedules and archived activities', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: weekly }),
    );
    const bad = await setActivitySchedule(h.deps, {
      activityId: a.activity.id,
      schedule: { ...weekly, strategy: { kind: 'calendar', interval: { every: 0, unit: 'week' } } },
    });
    expect(bad.ok).toBe(false);

    must(await archiveActivity(h.deps, { activityId: a.activity.id }));
    const archived = await setActivitySchedule(h.deps, {
      activityId: a.activity.id,
      schedule: weekly,
    });
    expect(!archived.ok && archived.error.code).toBe('invariant');
  });
});

describe('updateAsset and reactivation', () => {
  it('edits details but not status, and validates', async () => {
    const h = createHarness();
    const car = must(await createAsset(h.deps, { name: 'Honda Cty', purchaseDate: '2024-03-01' }));
    must(await setAssetStatus(h.deps, { assetId: car.id, status: 'in_storage' }));

    const updated = must(
      await updateAsset(h.deps, {
        assetId: car.id,
        name: 'Honda City',
        vendor: 'City Motors',
        purchaseDate: '2024-03-01',
        purchasePrice: { minor: 100000, currency: 'EUR' },
        warrantyExpiresOn: '2027-03-01',
      }),
    );
    expect(updated.name).toBe('Honda City');
    expect(updated.status).toBe('in_storage');
    expect(updated.purchase.price).toEqual({ minor: 100000, currency: 'EUR' });
    expect(updated.warranty?.expiresOn).toBe('2027-03-01');

    const bad = await updateAsset(h.deps, {
      assetId: car.id,
      name: 'Honda City',
      purchaseDate: '2024-03-01',
      warrantyExpiresOn: '2020-01-01',
    });
    expect(!bad.ok && bad.error.issues[0]?.path).toBe('warranty.expiresOn');
  });

  it('brings a retired asset back to active', async () => {
    const h = createHarness();
    const car = must(await createAsset(h.deps, { name: 'Car' }));
    must(await setAssetStatus(h.deps, { assetId: car.id, status: 'retired' }));
    const back = must(await setAssetStatus(h.deps, { assetId: car.id, status: 'active' }));
    expect(back.status).toBe('active');
  });
});
