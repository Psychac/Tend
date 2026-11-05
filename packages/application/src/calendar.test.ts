import type { LocalDate, Result, TimeZoneId } from '@tend/domain';
import {
  archiveActivity,
  completeOccurrence,
  createActivity,
  getCalendarMonth,
  skipOccurrence,
  type CalendarMonth,
} from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

const KOLKATA = 'Asia/Kolkata' as TimeZoneId;
const TODAY = '2026-11-05' as LocalDate; // a Thursday
const weekly = {
  strategy: { kind: 'calendar', interval: { every: 1, unit: 'week' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05',
} as const;

const month = (h: ReturnType<typeof createHarness>, year: number, m: number) =>
  getCalendarMonth(h.repos, { year, month: m, today: TODAY, timeZone: KOLKATA });

const dayOf = (cal: CalendarMonth, date: string) => cal.weeks.flat().find((d) => d.date === date)!;

describe('getCalendarMonth grid', () => {
  it('lays out whole Monday-to-Sunday weeks around the month', async () => {
    const cal = await month(createHarness(), 2026, 11);
    // 1 Nov 2026 is a Sunday: the grid starts Monday 26 Oct and ends Sunday 6 Dec.
    expect(cal.weeks).toHaveLength(6);
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true);
    expect(cal.weeks[0]![0]!.date).toBe('2026-10-26');
    expect(cal.weeks[0]![0]!.inMonth).toBe(false);
    expect(cal.weeks[0]![6]!.date).toBe('2026-11-01');
    expect(cal.weeks[0]![6]!.inMonth).toBe(true);
    expect(cal.weeks.at(-1)![6]!.date).toBe('2026-12-06');
  });

  it('handles February in a leap year and December', async () => {
    const h = createHarness();
    const feb = await month(h, 2028, 2);
    expect(feb.weeks.flat().filter((d) => d.inMonth)).toHaveLength(29);
    const dec = await month(h, 2026, 12);
    expect(dec.weeks.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });
});

describe('getCalendarMonth contents', () => {
  it('shows due work, and projects a weekly schedule into later months', async () => {
    const h = createHarness();
    must(await createActivity(h.deps, { name: 'Clean AC', type: 'maintenance', schedule: weekly }));

    const nov = await month(h, 2026, 11);
    expect(dayOf(nov, '2026-11-05').entries).toMatchObject([
      { kind: 'due', activityName: 'Clean AC' },
    ]);
    // Within the generated horizon the occurrence exists; beyond it the date is projected.
    expect(dayOf(nov, '2026-11-12').entries[0]?.kind).toBe('due');
    expect(dayOf(nov, '2026-11-26').entries[0]?.kind).toBe('due');
    expect(dayOf(nov, '2026-11-04').entries).toEqual([]); // nothing is back-filled

    const dec = await month(h, 2026, 12);
    expect(dayOf(dec, '2026-12-17').entries[0]?.kind).toBe('projected');
    const projected = dec.weeks.flat().filter((d) => d.inMonth && d.entries.length > 0);
    expect(projected.map((d) => d.date)).toEqual([
      '2026-12-03',
      '2026-12-10',
      '2026-12-17',
      '2026-12-24',
      '2026-12-31',
    ]);
  });

  it('does not show a projected entry on top of an existing occurrence', async () => {
    const h = createHarness();
    must(await createActivity(h.deps, { name: 'Clean AC', type: 'maintenance', schedule: weekly }));
    const nov = await month(h, 2026, 11);
    const counts = nov.weeks.flat().map((d) => d.entries.length);
    expect(Math.max(...counts)).toBe(1);
  });

  it('marks overdue work and keeps done and skipped on their days', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Check smoke alarm',
        type: 'inspection',
        schedule: weekly,
      }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    must(await skipOccurrence(h.deps, { occurrenceId: a.occurrences[1]!.id }));

    const nov = await month(h, 2026, 11);
    expect(dayOf(nov, '2026-11-05').entries.map((e) => e.kind)).toEqual(['done']);
    expect(dayOf(nov, '2026-11-12').entries.map((e) => e.kind)).toEqual(['skipped']);

    h.clock.set('2026-11-20T06:30:00.000Z');
    const later = await getCalendarMonth(h.repos, {
      year: 2026,
      month: 11,
      today: '2026-11-20' as LocalDate,
      timeZone: KOLKATA,
    });
    expect(dayOf(later, '2026-11-12').entries.map((e) => e.kind)).toEqual(['skipped']);
  });

  it('shows a late completion on the day it was done', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Water plants', type: 'routine', schedule: weekly }),
    );
    h.clock.set('2026-11-08T06:30:00.000Z');
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    const nov = await getCalendarMonth(h.repos, {
      year: 2026,
      month: 11,
      today: '2026-11-08' as LocalDate,
      timeZone: KOLKATA,
    });
    expect(dayOf(nov, '2026-11-08').entries.map((e) => e.kind)).toContain('done');
    expect(dayOf(nov, '2026-11-05').entries).toEqual([]); // not shown as both done and overdue
  });

  it('flags an outstanding past occurrence as overdue', async () => {
    const h = createHarness();
    must(
      await createActivity(h.deps, { name: 'Pay rent', type: 'administrative', schedule: weekly }),
    );
    h.clock.set('2026-11-09T06:30:00.000Z');
    const nov = await getCalendarMonth(h.repos, {
      year: 2026,
      month: 11,
      today: '2026-11-09' as LocalDate,
      timeZone: KOLKATA,
    });
    expect(dayOf(nov, '2026-11-05').entries[0]?.kind).toBe('overdue');
  });

  it('leaves archived activities off the future calendar', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Old chore', type: 'routine', schedule: weekly }),
    );
    must(await archiveActivity(h.deps, { activityId: a.activity.id }));
    const dec = await month(h, 2026, 12);
    expect(dec.weeks.flat().every((d) => d.entries.length === 0)).toBe(true);
  });
});
