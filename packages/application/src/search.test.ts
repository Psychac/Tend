import type { Result } from '@tend/domain';
import { archiveActivity, createActivity, createAsset, logCompletion, searchAll } from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe('searchAll', () => {
  it('finds activities (even archived), assets and notes, ignoring case', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Service the boiler', type: 'maintenance' }),
    );
    must(await createActivity(h.deps, { name: 'Water plants', type: 'routine' }));
    must(await createAsset(h.deps, { name: 'Boiler (hall)' }));
    must(
      await logCompletion(h.deps, {
        activityId: a.activity.id,
        notes: 'Replaced the BOILER valve',
      }),
    );
    must(await archiveActivity(h.deps, { activityId: a.activity.id }));

    const r = await searchAll(h.repos, 'boiler');
    expect(r.activities.map((x) => x.name)).toEqual(['Service the boiler']);
    expect(r.assets.map((x) => x.name)).toEqual(['Boiler (hall)']);
    expect(r.notes.map((n) => n.activityName)).toEqual(['Service the boiler']);
  });

  it('returns nothing for an empty query', async () => {
    const h = createHarness();
    must(await createActivity(h.deps, { name: 'Anything', type: 'routine' }));
    const r = await searchAll(h.repos, '   ');
    expect([r.activities, r.assets, r.notes]).toEqual([[], [], []]);
  });
});
