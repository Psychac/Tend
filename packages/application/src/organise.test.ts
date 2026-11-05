import type { Result } from '@tend/domain';
import {
  archiveActivity,
  createActivity,
  createAsset,
  createCategory,
  createLocation,
  deleteCategory,
  deleteLocation,
  listActivities,
  listAssets,
  listCategories,
  listLocations,
  updateActivity,
  updateAsset,
  updateCategory,
  updateLocation,
} from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe('categories', () => {
  it('creates, renames and lists categories with how often they are used', async () => {
    const h = createHarness();
    const cleaning = must(
      await createCategory(h.deps, { name: ' Cleaning ', description: 'Regular upkeep' }),
    );
    expect(cleaning.name).toBe('Cleaning');
    must(await createActivity(h.deps, { name: 'Mop', type: 'cleaning', categoryId: cleaning.id }));
    must(await createAsset(h.deps, { name: 'Vacuum', categoryId: cleaning.id }));

    const renamed = must(
      await updateCategory(h.deps, { categoryId: cleaning.id, name: 'Home cleaning' }),
    );
    expect(renamed.meta.version).toBe(cleaning.meta.version + 1);

    const [item] = await listCategories(h.repos);
    expect(item).toMatchObject({ activityCount: 1, assetCount: 1 });
    expect(item?.category.name).toBe('Home cleaning');
  });

  it('refuses blank and duplicate names, ignoring case', async () => {
    const h = createHarness();
    must(await createCategory(h.deps, { name: 'Garden' }));
    const dup = await createCategory(h.deps, { name: 'garden ' });
    expect(!dup.ok && dup.error.issues[0]?.message).toMatch(/already exists/);
    const blank = await createCategory(h.deps, { name: '  ' });
    expect(!blank.ok && blank.error.issues[0]?.path).toBe('name');

    const other = must(await createCategory(h.deps, { name: 'Pool' }));
    const clash = await updateCategory(h.deps, { categoryId: other.id, name: 'GARDEN' });
    expect(!clash.ok && clash.error.issues[0]?.message).toMatch(/already exists/);
    // Keeping its own name is not a clash.
    must(
      await updateCategory(h.deps, { categoryId: other.id, name: 'Pool', description: 'Swimming' }),
    );
  });

  it('deletes an unused category but refuses one in use, saying what uses it', async () => {
    const h = createHarness();
    const used = must(await createCategory(h.deps, { name: 'Used' }));
    const unused = must(await createCategory(h.deps, { name: 'Unused' }));
    const a = must(
      await createActivity(h.deps, { name: 'A', type: 'routine', categoryId: used.id }),
    );
    must(await createAsset(h.deps, { name: 'Thing', categoryId: used.id }));

    const refused = await deleteCategory(h.deps, { categoryId: used.id });
    expect(!refused.ok && refused.error.message).toMatch(/1 activity and 1 asset/);
    must(await deleteCategory(h.deps, { categoryId: unused.id }));
    expect(await listCategories(h.repos)).toHaveLength(1);
    expect(a.activity.categoryId).toBe(used.id);
  });

  it('counts archived activities as use, so history is never orphaned', async () => {
    const h = createHarness();
    const cat = must(await createCategory(h.deps, { name: 'Old' }));
    const a = must(
      await createActivity(h.deps, { name: 'A', type: 'routine', categoryId: cat.id }),
    );
    must(await archiveActivity(h.deps, { activityId: a.activity.id }));
    const refused = await deleteCategory(h.deps, { categoryId: cat.id });
    expect(refused.ok).toBe(false);
  });

  it('is gentle with ids that do not exist', async () => {
    const h = createHarness();
    const r = await updateCategory(h.deps, { categoryId: 'nope' as never, name: 'X' });
    expect(!r.ok && r.error.code).toBe('not_found');
    const d = await deleteCategory(h.deps, { categoryId: 'nope' as never });
    expect(!d.ok && d.error.code).toBe('not_found');
  });
});

describe('locations', () => {
  it('builds a tree and shows each place with its path', async () => {
    const h = createHarness();
    const house = must(await createLocation(h.deps, { name: 'House', kind: 'place' }));
    const kitchen = must(
      await createLocation(h.deps, { name: 'Kitchen', kind: 'room', parentId: house.id }),
    );
    must(await createLocation(h.deps, { name: 'Pantry', kind: 'area', parentId: kitchen.id }));
    must(await createLocation(h.deps, { name: 'Garage', kind: 'room' }));

    const items = await listLocations(h.repos);
    expect(items.map((i) => [i.path, i.depth])).toEqual([
      ['Garage', 0],
      ['House', 0],
      ['House › Kitchen', 1],
      ['House › Kitchen › Pantry', 2],
    ]);
  });

  it('allows the same name under different parents but not side by side', async () => {
    const h = createHarness();
    const a = must(await createLocation(h.deps, { name: 'Upstairs' }));
    const b = must(await createLocation(h.deps, { name: 'Downstairs' }));
    must(await createLocation(h.deps, { name: 'Bathroom', parentId: a.id }));
    must(await createLocation(h.deps, { name: 'Bathroom', parentId: b.id }));
    const dup = await createLocation(h.deps, { name: 'bathroom', parentId: a.id });
    expect(!dup.ok && dup.error.issues[0]?.message).toMatch(/already a place/);
  });

  it('refuses a parent that does not exist and moves that would create a loop', async () => {
    const h = createHarness();
    const missing = await createLocation(h.deps, { name: 'X', parentId: 'nope' as never });
    expect(!missing.ok && missing.error.code).toBe('not_found');

    const house = must(await createLocation(h.deps, { name: 'House' }));
    const kitchen = must(await createLocation(h.deps, { name: 'Kitchen', parentId: house.id }));
    const pantry = must(await createLocation(h.deps, { name: 'Pantry', parentId: kitchen.id }));

    const self = await updateLocation(h.deps, {
      locationId: house.id,
      name: 'House',
      parentId: house.id,
    });
    expect(self.ok).toBe(false);
    const loop = await updateLocation(h.deps, {
      locationId: house.id,
      name: 'House',
      parentId: pantry.id,
    });
    expect(!loop.ok && loop.error.issues[0]?.message).toMatch(/inside itself/);

    // A valid move works and updates paths.
    must(
      await updateLocation(h.deps, { locationId: pantry.id, name: 'Pantry', parentId: house.id }),
    );
    expect((await listLocations(h.repos)).map((i) => i.path)).toContain('House › Pantry');
  });

  it('refuses to delete a place that is in use or has places inside it', async () => {
    const h = createHarness();
    const house = must(await createLocation(h.deps, { name: 'House' }));
    const kitchen = must(await createLocation(h.deps, { name: 'Kitchen', parentId: house.id }));
    must(await createActivity(h.deps, { name: 'Wipe', type: 'cleaning', locationId: kitchen.id }));

    const hasChild = await deleteLocation(h.deps, { locationId: house.id });
    expect(!hasChild.ok && hasChild.error.message).toMatch(/1 place inside it/);
    const inUse = await deleteLocation(h.deps, { locationId: kitchen.id });
    expect(!inUse.ok && inUse.error.message).toMatch(/1 activity/);

    const spare = must(await createLocation(h.deps, { name: 'Shed' }));
    must(await deleteLocation(h.deps, { locationId: spare.id }));
  });
});

describe('using categories and locations', () => {
  it('shows them on activities and filters by them', async () => {
    const h = createHarness();
    const cat = must(await createCategory(h.deps, { name: 'Cleaning' }));
    const house = must(await createLocation(h.deps, { name: 'House' }));
    const kitchen = must(await createLocation(h.deps, { name: 'Kitchen', parentId: house.id }));
    must(
      await createActivity(h.deps, {
        name: 'Wipe counters',
        type: 'cleaning',
        categoryId: cat.id,
        locationId: kitchen.id,
      }),
    );
    must(await createActivity(h.deps, { name: 'Pay rent', type: 'administrative' }));

    const all = await listActivities(h.repos);
    const wipe = all.find((i) => i.activity.name === 'Wipe counters');
    expect(wipe).toMatchObject({ categoryName: 'Cleaning', locationPath: 'House › Kitchen' });

    expect(
      (await listActivities(h.repos, { categoryId: cat.id })).map((i) => i.activity.name),
    ).toEqual(['Wipe counters']);
    expect((await listActivities(h.repos, { locationId: kitchen.id })).length).toBe(1);
  });

  it('assigns and clears them when editing an activity or an asset', async () => {
    const h = createHarness();
    const cat = must(await createCategory(h.deps, { name: 'Vehicles' }));
    const place = must(await createLocation(h.deps, { name: 'Garage' }));
    const a = must(await createActivity(h.deps, { name: 'Oil', type: 'maintenance' }));
    const base = { activityId: a.activity.id, name: 'Oil', type: 'maintenance' } as const;

    const set = must(
      await updateActivity(h.deps, { ...base, categoryId: cat.id, locationId: place.id }),
    );
    expect([set.categoryId, set.locationId]).toEqual([cat.id, place.id]);
    const cleared = must(await updateActivity(h.deps, base));
    expect([cleared.categoryId, cleared.locationId]).toEqual([undefined, undefined]);

    const car = must(
      await createAsset(h.deps, { name: 'Car', categoryId: cat.id, locationId: place.id }),
    );
    expect([car.categoryId, car.locationId]).toEqual([cat.id, place.id]);
    expect((await listAssets(h.repos, { categoryId: cat.id })).length).toBe(1);
    expect((await listAssets(h.repos, { locationId: 'other' as never })).length).toBe(0);

    const moved = must(await updateAsset(h.deps, { assetId: car.id, name: 'Car' }));
    expect([moved.categoryId, moved.locationId]).toEqual([undefined, undefined]);
  });

  it('rejects a category or place that does not exist', async () => {
    const h = createHarness();
    const bad = await createAsset(h.deps, { name: 'Car', categoryId: 'nope' as never });
    expect(!bad.ok && bad.error.code).toBe('not_found');
    const bad2 = await createAsset(h.deps, { name: 'Car', locationId: 'nope' as never });
    expect(!bad2.ok && bad2.error.code).toBe('not_found');
  });
});
