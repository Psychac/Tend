import type { Result, TimeZoneId } from '@tend/domain';
import { createActivity, exportHistoryCsv, logCompletion } from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

describe('exportHistoryCsv', () => {
  it('writes a header and one row per entry, with costs as decimals', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'Service, car', type: 'maintenance' }));
    must(
      await logCompletion(h.deps, {
        activityId: a.activity.id,
        notes: 'said "ok"',
        cost: { minor: 123456, currency: 'INR' },
      }),
    );
    const csv = await exportHistoryCsv(h.repos, 'Asia/Kolkata' as TimeZoneId);
    expect(csv.split('\r\n')).toEqual([
      'Date,Activity,What happened,Planned for,Cost,Currency,Notes',
      '2026-11-05,"Service, car",Done,,1234.56,INR,"said ""ok"""',
      '',
    ]);
  });

  it('defuses text a spreadsheet would run as a formula', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: '=HYPERLINK("x")', type: 'routine' }));
    must(await logCompletion(h.deps, { activityId: a.activity.id }));
    const csv = await exportHistoryCsv(h.repos, 'Asia/Kolkata' as TimeZoneId);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('is just the header when there is nothing', async () => {
    const h = createHarness();
    expect(await exportHistoryCsv(h.repos, 'Asia/Kolkata' as TimeZoneId)).toBe(
      'Date,Activity,What happened,Planned for,Cost,Currency,Notes\r\n',
    );
  });
});
