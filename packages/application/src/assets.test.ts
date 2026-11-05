import type { Result } from '@upkeep/domain';
import {
  createActivity,
  createAsset,
  listAssets,
  recordMeasurement,
  setAssetStatus,
} from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe('createAsset', () => {
  it('stores purchase and warranty details and records an audit event', async () => {
    const h = createHarness();
    const asset = must(
      await createAsset(h.deps, {
        name: ' Honda City ',
        vendor: 'City Motors',
        purchaseDate: '2024-03-01',
        purchasePrice: { minor: 1_200_000_00, currency: 'INR' },
        warrantyExpiresOn: '2027-03-01',
      }),
    );
    expect(asset.name).toBe('Honda City');
    expect(asset.status).toBe('active');
    expect(asset.warranty?.expiresOn).toBe('2027-03-01');
    expect(await h.repos.audit.list({})).toHaveLength(1);
  });

  it('explains invalid input', async () => {
    const h = createHarness();
    const blank = await createAsset(h.deps, { name: '  ' });
    expect(!blank.ok && blank.error.issues[0]?.path).toBe('name');

    const badDate = await createAsset(h.deps, { name: 'Car', purchaseDate: '01/03/2024' });
    expect(!badDate.ok && badDate.error.issues[0]?.path).toBe('purchaseDate');

    const early = await createAsset(h.deps, {
      name: 'Car',
      purchaseDate: '2024-03-01',
      warrantyExpiresOn: '2023-01-01',
    });
    expect(!early.ok && early.error.issues[0]?.path).toBe('warranty.expiresOn');
  });
});

describe('setAssetStatus', () => {
  it('retires an asset, hides it from the default list, and refuses a no-op change', async () => {
    const h = createHarness();
    const asset = must(await createAsset(h.deps, { name: 'Old fridge' }));
    must(await setAssetStatus(h.deps, { assetId: asset.id, status: 'retired' }));

    expect(await listAssets(h.repos)).toHaveLength(0);
    expect(await listAssets(h.repos, { includeInactive: true })).toHaveLength(1);

    const again = await setAssetStatus(h.deps, { assetId: asset.id, status: 'retired' });
    expect(!again.ok && again.error.code).toBe('invariant');
  });
});

describe('listAssets', () => {
  it('shows linked activity counts and the latest reading per meter', async () => {
    const h = createHarness();
    const car = must(await createAsset(h.deps, { name: 'Honda City' }));
    must(await createAsset(h.deps, { name: 'Bicycle' }));
    must(
      await createActivity(h.deps, { name: 'Oil change', type: 'maintenance', assetId: car.id }),
    );

    must(
      await recordMeasurement(h.deps, {
        assetId: car.id,
        measurement: { kind: 'numeric', key: 'odometer', value: 12000, unit: 'km' },
      }),
    );
    h.clock.set('2026-11-06T06:30:00.000Z');
    must(
      await recordMeasurement(h.deps, {
        assetId: car.id,
        measurement: { kind: 'numeric', key: 'odometer', value: 12400, unit: 'km' },
      }),
    );

    const items = await listAssets(h.repos);
    const honda = items.find((i) => i.asset.name === 'Honda City');
    expect(honda?.activityCount).toBe(1);
    expect(honda?.latestReadings).toHaveLength(1);
    expect(honda?.latestReadings[0]?.value).toMatchObject({
      kind: 'numeric',
      quantity: { value: 12400, unit: 'km' },
    });
    expect(items.find((i) => i.asset.name === 'Bicycle')?.activityCount).toBe(0);
  });

  it('filters by search text', async () => {
    const h = createHarness();
    must(await createAsset(h.deps, { name: 'Honda City' }));
    must(await createAsset(h.deps, { name: 'Bicycle' }));
    expect(await listAssets(h.repos, { search: 'bike' })).toHaveLength(0);
    expect(await listAssets(h.repos, { search: 'hond' })).toHaveLength(1);
  });
});
