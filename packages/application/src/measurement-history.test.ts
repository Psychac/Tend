import type { Result } from '@tend/domain';
import { createAsset, getAssetMeasurementHistory, recordMeasurement } from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe('asset measurement history', () => {
  it('groups readings by what was measured, oldest first, and keeps ratings separate', async () => {
    const h = createHarness('2026-11-01T06:00:00.000Z');
    const asset = must(await createAsset(h.deps, { name: 'Pool' }));
    const other = must(await createAsset(h.deps, { name: 'Car' }));
    const num = (key: string, value: number, unit: string, assetId = asset.id) =>
      recordMeasurement(h.deps, { assetId, measurement: { kind: 'numeric', key, value, unit } });

    must(await num('pH', 7.2, 'pH'));
    h.clock.set('2026-11-02T06:00:00.000Z');
    must(await num('pH', 7.6, 'pH'));
    must(await num('odometer', 100, 'km', other.id));
    h.clock.set('2026-11-03T06:00:00.000Z');
    must(
      await recordMeasurement(h.deps, {
        assetId: asset.id,
        measurement: { kind: 'qualitative', key: 'condition', label: 'Fair' },
      }),
    );

    const history = await getAssetMeasurementHistory(h.repos, asset.id);
    expect(history.map((s) => [s.key, s.kind])).toEqual([
      ['condition', 'qualitative'],
      ['pH', 'numeric'],
    ]);
    const ph = history.find((s) => s.key === 'pH')!;
    expect(ph.unit).toBe('pH');
    expect(ph.points.map((p) => p.value)).toEqual([7.2, 7.6]);
    expect(history[0]!.points[0]!.label).toBe('Fair');
  });

  it('is empty for an asset with no readings', async () => {
    const h = createHarness();
    const asset = must(await createAsset(h.deps, { name: 'Lamp' }));
    expect(await getAssetMeasurementHistory(h.repos, asset.id)).toEqual([]);
  });
});
