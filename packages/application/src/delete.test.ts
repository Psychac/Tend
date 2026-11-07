import type { Result } from '@tend/domain';
import {
  addAttachment,
  completeOccurrence,
  createActivity,
  createAsset,
  deleteActivity,
  deleteAsset,
  listActivities,
  logCompletion,
  skipOccurrence,
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

describe('deleteActivity', () => {
  it('removes a never-done activity with its schedule and open items', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Oops', type: 'routine', schedule: weekly }),
    );
    must(await deleteActivity(h.deps, { activityId: a.activity.id }));
    expect(await listActivities(h.repos, { includeArchived: true })).toEqual([]);
    expect(await h.repos.occurrences.list({})).toEqual([]);
    expect(await h.repos.schedules.list()).toEqual([]);
  });

  it('refuses an activity that has been done, logged, or skipped', async () => {
    const h = createHarness();
    const done = must(
      await createActivity(h.deps, { name: 'A', type: 'routine', schedule: weekly }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: done.occurrences[0]!.id }));
    expect((await deleteActivity(h.deps, { activityId: done.activity.id })).ok).toBe(false);

    const logged = must(await createActivity(h.deps, { name: 'B', type: 'routine' }));
    must(await logCompletion(h.deps, { activityId: logged.activity.id }));
    expect((await deleteActivity(h.deps, { activityId: logged.activity.id })).ok).toBe(false);

    const skipped = must(
      await createActivity(h.deps, { name: 'C', type: 'routine', schedule: weekly }),
    );
    must(await skipOccurrence(h.deps, { occurrenceId: skipped.occurrences[0]!.id }));
    expect((await deleteActivity(h.deps, { activityId: skipped.activity.id })).ok).toBe(false);
  });

  it('refuses while another activity follows it', async () => {
    const h = createHarness();
    const first = must(await createActivity(h.deps, { name: 'Brew', type: 'routine' }));
    must(
      await createActivity(h.deps, {
        name: 'Bottle',
        type: 'routine',
        schedule: {
          strategy: { kind: 'event', afterActivityId: first.activity.id, delayDays: 7 },
          timeZone: 'Asia/Kolkata',
          startsOn: '2026-11-05',
        },
      }),
    );
    expect((await deleteActivity(h.deps, { activityId: first.activity.id })).ok).toBe(false);
  });

  it('removes its attached files too', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'Oops', type: 'routine' }));
    must(
      await addAttachment(h.deps, {
        subject: { type: 'activity', id: a.activity.id },
        file: { name: 'n.txt', type: 'text/plain', data: new Blob(['abc']) },
      }),
    );
    expect(await h.deps.files.list()).toHaveLength(1);
    must(await deleteActivity(h.deps, { activityId: a.activity.id }));
    expect(await h.deps.files.list()).toHaveLength(0);
    expect(await h.repos.attachments.list()).toHaveLength(0);
  });
});

describe('deleteAsset', () => {
  it('removes an unused asset, but not one an activity uses', async () => {
    const h = createHarness();
    const free = must(await createAsset(h.deps, { name: 'Spare' }));
    const used = must(await createAsset(h.deps, { name: 'Car' }));
    must(await createActivity(h.deps, { name: 'Service', type: 'maintenance', assetId: used.id }));
    must(await deleteAsset(h.deps, { assetId: free.id }));
    const refused = await deleteAsset(h.deps, { assetId: used.id });
    expect(refused.ok).toBe(false);
    expect(await h.repos.assets.list({})).toHaveLength(1);
  });
});
