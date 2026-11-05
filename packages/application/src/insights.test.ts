import type { LocalDate, Result, TimeZoneId } from '@upkeep/domain';
import {
  completeOccurrence,
  createActivity,
  createAsset,
  getInsights,
  recordMeasurement,
  skipOccurrence,
} from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

const KOLKATA = 'Asia/Kolkata' as TimeZoneId;
const daily = {
  strategy: { kind: 'calendar', interval: { every: 1, unit: 'day' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05',
} as const;

const insights = (h: ReturnType<typeof createHarness>, today: string, from?: string) =>
  getInsights(h.repos, {
    today: today as LocalDate,
    from: from as LocalDate | undefined,
    timeZone: KOLKATA,
  });

describe('getInsights', () => {
  it('is empty and does not divide by zero on a new install', async () => {
    const view = await insights(createHarness(), '2026-11-05');
    expect(view).toMatchObject({ completed: 0, skipped: 0, overdueNow: 0, spend: [] });
    expect(view.onTimeRate).toBeUndefined();
    expect(view.averageDaysLate).toBeUndefined();
    expect(view.months).toEqual([]);
  });

  it('measures on-time rate and lateness against planned dates', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Water plants', type: 'routine', schedule: daily }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id })); // Nov 5 on time
    h.clock.set('2026-11-08T06:30:00.000Z');
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[1]!.id })); // due Nov 6, done Nov 8: 2 late

    const view = await insights(h, '2026-11-08');
    expect(view.completed).toBe(2);
    expect(view.onTime).toBe(1);
    expect(view.late).toBe(1);
    expect(view.onTimeRate).toBe(0.5);
    expect(view.averageDaysLate).toBe(2);
  });

  it('totals spend per currency without mixing them', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Service', type: 'maintenance', schedule: daily }),
    );
    must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[0]!.id,
        cost: { minor: 1000, currency: 'INR' },
      }),
    );
    must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[1]!.id,
        cost: { minor: 500, currency: 'USD' },
      }),
    );
    must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[2]!.id,
        cost: { minor: 250, currency: 'INR' },
      }),
    );

    const view = await insights(h, '2026-11-05');
    expect([...view.spend].sort((x, y) => x.currency.localeCompare(y.currency))).toEqual([
      { currency: 'INR', minor: 1250 },
      { currency: 'USD', minor: 500 },
    ]);
    expect(view.activities[0]?.spend).toHaveLength(2);
  });

  it('counts overdue work and skipped occurrences, and buckets by month including quiet ones', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    must(await skipOccurrence(h.deps, { occurrenceId: a.occurrences[1]!.id }));

    h.clock.set('2027-01-15T06:30:00.000Z');
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[2]!.id }));

    const view = await insights(h, '2027-01-15');
    expect(view.months.map((m) => m.month)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(view.months[0]).toMatchObject({ completed: 1, skipped: 1 });
    expect(view.months[1]).toMatchObject({ completed: 0, skipped: 0 }); // quiet month still listed
    expect(view.months[2]).toMatchObject({ completed: 1 });
    expect(view.skipped).toBe(1);
  });

  it('limits results to the chosen range', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    h.clock.set('2026-12-20T06:30:00.000Z');
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[1]!.id }));

    expect((await insights(h, '2026-12-20')).completed).toBe(2);
    expect((await insights(h, '2026-12-20', '2026-12-01')).completed).toBe(1);
  });

  it('reports per-activity frequency', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Filter', type: 'maintenance', schedule: daily }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    h.clock.set('2026-11-15T06:30:00.000Z');
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[1]!.id }));
    h.clock.set('2026-11-25T06:30:00.000Z');
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[2]!.id }));

    const [item] = (await insights(h, '2026-11-25')).activities;
    expect(item).toMatchObject({
      name: 'Filter',
      completed: 3,
      averageIntervalDays: 10,
      lastDoneOn: '2026-11-25',
    });
  });

  it('summarises how fast a meter moves', async () => {
    const h = createHarness();
    const car = must(await createAsset(h.deps, { name: 'Honda City' }));
    const read = async (value: number) =>
      must(
        await recordMeasurement(h.deps, {
          assetId: car.id,
          measurement: { kind: 'numeric', key: 'odometer', value, unit: 'km' },
        }),
      );
    await read(10000);
    h.clock.set('2026-12-05T06:30:00.000Z'); // 30 days later
    await read(10600);

    const [meter] = (await insights(h, '2026-12-05')).meters;
    expect(meter).toMatchObject({
      assetName: 'Honda City',
      key: 'odometer',
      unit: 'km',
      per30Days: 600,
    });
    expect(meter?.first.value).toBe(10000);
    expect(meter?.last.value).toBe(10600);
  });
});
