import {
  createAsset as createAssetEntity,
  type LocalDate,
  type Result,
  type TimeZoneId,
} from '@tend/domain';
import {
  completeOccurrence,
  createActivity,
  createAsset,
  getAssetAlerts,
  recordMeasurement,
  setAssetStatus,
} from './index';
import { createHarness, OWNER } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

const today = '2026-11-05' as LocalDate;
const opts = { today, timeZone: 'Asia/Kolkata' as TimeZoneId };

describe('asset alerts', () => {
  it('is empty when nothing needs attention', async () => {
    const h = createHarness();
    await createAsset(h.deps, { name: 'Kettle', warrantyExpiresOn: '2030-01-01' });
    expect(await getAssetAlerts(h.repos, opts)).toEqual([]);
  });

  it('flags a warranty ending soon but not a distant or expired one', async () => {
    const h = createHarness();
    await createAsset(h.deps, { name: 'TV', warrantyExpiresOn: '2026-11-17' });
    await createAsset(h.deps, { name: 'Phone', warrantyExpiresOn: '2027-06-01' });
    await createAsset(h.deps, { name: 'Old laptop', warrantyExpiresOn: '2025-01-01' });
    const alerts = await getAssetAlerts(h.repos, opts);
    expect(alerts.map((a) => [a.kind, a.assetName, a.message])).toEqual([
      ['warranty_expiring', 'TV', 'Warranty ends in 12 days'],
    ]);
  });

  it('flags an asset near its expected life or in poor condition, not a retired one', async () => {
    const h = createHarness();
    await createAsset(h.deps, {
      name: 'Heater',
      purchaseDate: '2016-12-01',
      expectedLifeYears: 10,
    });
    await createAsset(h.deps, { name: 'Sofa', condition: 'poor' });
    const gone = must(await createAsset(h.deps, { name: 'Gone', condition: 'poor' }));
    must(await setAssetStatus(h.deps, { assetId: gone.id, status: 'retired' }));
    const alerts = await getAssetAlerts(h.repos, opts);
    expect(alerts.map((a) => [a.kind, a.assetName, a.message])).toEqual([
      ['replace_soon', 'Heater', 'Reaches its expected life in 26 days'],
      ['replace_soon', 'Sofa', 'In poor condition'],
    ]);
  });

  describe('usage meters', () => {
    async function car() {
      const h = createHarness();
      const asset = createAssetEntity({
        id: h.deps.ids.next<'Asset'>(),
        ownerId: OWNER,
        now: h.clock.now(),
        name: 'Car',
      });
      if (!asset.ok) throw new Error('asset');
      await h.repos.assets.save(asset.value);
      must(
        await createActivity(h.deps, {
          name: 'Oil change',
          type: 'maintenance',
          assetId: asset.value.id,
          schedule: {
            strategy: { kind: 'usage', every: { value: 5000, unit: 'km' }, meterKey: 'odometer' },
            timeZone: 'Asia/Kolkata',
            startsOn: '2026-11-05',
          },
        }),
      );
      const read = (value: number) =>
        recordMeasurement(h.deps, {
          assetId: asset.value.id,
          measurement: { kind: 'numeric', key: 'odometer', value, unit: 'km' },
        });
      return { h, read };
    }

    it('warns close to the interval, and stays quiet once it is due', async () => {
      const { h, read } = await car();
      must(await read(40000));
      must(await read(42000));
      expect(await getAssetAlerts(h.repos, opts)).toEqual([]);

      must(await read(44600));
      const near = await getAssetAlerts(h.repos, opts);
      expect(near.map((a) => [a.kind, a.message])).toEqual([
        ['usage_near', 'Oil change in 400 km'],
      ]);

      must(await read(45100));
      expect((await getAssetAlerts(h.repos, opts)).filter((a) => a.kind === 'usage_near')).toEqual(
        [],
      );
    });
  });

  describe('no recent service', () => {
    it('flags an old asset with activities but no completions, then clears after service', async () => {
      const h = createHarness('2025-06-01T06:30:00.000Z');
      const asset = must(await createAsset(h.deps, { name: 'Boiler' }));
      const { occurrences } = must(
        await createActivity(h.deps, {
          name: 'Service boiler',
          type: 'maintenance',
          assetId: asset.id,
          schedule: {
            strategy: { kind: 'calendar', interval: { every: 1, unit: 'year' } },
            timeZone: 'Asia/Kolkata',
            startsOn: '2025-06-01',
          },
        }),
      );
      expect(occurrences).toBeDefined();

      h.clock.set('2026-11-05T06:30:00.000Z');
      const stale = await getAssetAlerts(h.repos, opts);
      expect(stale.map((a) => [a.kind, a.message])).toEqual([
        ['no_recent_service', 'No maintenance has been recorded yet'],
      ]);

      const [open] = await h.repos.occurrences.list({ status: ['pending'] });
      must(await completeOccurrence(h.deps, { occurrenceId: open!.id }));
      expect(await getAssetAlerts(h.repos, opts)).toEqual([]);
    });

    it('ignores a recent asset and an asset with no activities', async () => {
      const h = createHarness();
      await createAsset(h.deps, { name: 'Bare' });
      expect(await getAssetAlerts(h.repos, opts)).toEqual([]);
    });
  });
});
