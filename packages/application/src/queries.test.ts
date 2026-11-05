import type { Result, ScheduleStrategy, TimeZoneId } from '@upkeep/domain';
import {
  archiveActivity,
  completeOccurrence,
  createActivity,
  getDashboard,
  listActivities,
  skipOccurrence,
  snoozeOccurrence,
} from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

const KOLKATA = 'Asia/Kolkata' as TimeZoneId;
const daily: ScheduleStrategy = { kind: 'calendar', interval: { every: 1, unit: 'day' } };
const weekly: ScheduleStrategy = { kind: 'calendar', interval: { every: 1, unit: 'week' } };

const weeklyFrom = (startsOn: string, graceDays?: number) => ({
  strategy: weekly,
  timeZone: 'Asia/Kolkata',
  startsOn,
  graceDays,
});

describe('getDashboard', () => {
  it('groups outstanding work into overdue, due today and upcoming', async () => {
    const h = createHarness(); // Thu 2026-11-05, noon in Kolkata
    must(
      await createActivity(h.deps, {
        name: 'Take out recycling',
        type: 'routine',
        schedule: weeklyFrom('2026-11-05'),
      }),
    );
    h.clock.set('2026-11-13T06:30:00.000Z'); // Fri Nov 13: Nov 5 and Nov 12 are now past due

    const d = await getDashboard(h.repos, h.clock, { timeZone: KOLKATA });
    expect(d.today).toBe('2026-11-13');
    expect(d.overdue.map((i) => [i.dueOn, i.daysLate])).toEqual([
      ['2026-11-05', 8],
      ['2026-11-12', 1],
    ]);
    expect(d.dueToday).toEqual([]);
    expect(d.upcoming.map((i) => i.dueOn)).toEqual(['2026-11-19', '2026-11-26']);
  });

  it('orders today by priority, then name', async () => {
    const h = createHarness();
    const schedule = { strategy: daily, timeZone: 'Asia/Kolkata', startsOn: '2026-11-05' };
    must(
      await createActivity(h.deps, { name: 'B low', type: 'routine', priority: 'low', schedule }),
    );
    must(
      await createActivity(h.deps, { name: 'A high', type: 'routine', priority: 'high', schedule }),
    );
    must(await createActivity(h.deps, { name: 'C normal', type: 'routine', schedule }));

    const d = await getDashboard(h.repos, h.clock, { timeZone: KOLKATA, upcomingDays: 1 });
    expect(d.dueToday.map((i) => i.activity.name)).toEqual(['A high', 'C normal', 'B low']);
    expect(d.upcoming.every((i) => i.dueOn === '2026-11-06')).toBe(true);
  });

  it('flags late items inside their grace period', async () => {
    const h = createHarness();
    must(
      await createActivity(h.deps, {
        name: 'Water plants',
        type: 'routine',
        schedule: weeklyFrom('2026-11-05', 2),
      }),
    );
    h.clock.set('2026-11-07T06:30:00.000Z');
    const inGrace = await getDashboard(h.repos, h.clock, { timeZone: KOLKATA });
    expect(inGrace.overdue.map((i) => i.timing)).toEqual(['in_grace']);

    h.clock.set('2026-11-09T06:30:00.000Z');
    const late = await getDashboard(h.repos, h.clock, { timeZone: KOLKATA });
    expect(late.overdue.map((i) => i.timing)).toEqual(['overdue']);
  });

  it('moves a snoozed item to its snooze date and drops resolved and archived ones', async () => {
    const h = createHarness();
    const make = (name: string) =>
      createActivity(h.deps, { name, type: 'routine', schedule: weeklyFrom('2026-11-05') }).then(
        must,
      );
    const a = await make('Snooze me');
    const b = await make('Finish me');
    const c = await make('Archive me');
    must(
      await snoozeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id, until: '2026-11-07' }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: b.occurrences[0]!.id }));
    must(await archiveActivity(h.deps, { activityId: c.activity.id }));

    const d = await getDashboard(h.repos, h.clock, { timeZone: KOLKATA });
    expect(d.dueToday).toEqual([]);
    const names = d.upcoming.map((i) => `${i.activity.name}@${i.dueOn}`);
    expect(names[0]).toBe('Snooze me@2026-11-07');
    expect(names.some((n) => n.startsWith('Archive me'))).toBe(false);
    expect(d.recentCompletions.map((r) => r.activityName)).toEqual(['Finish me']);
  });

  it('uses the caller zone for "today"', async () => {
    const h = createHarness('2026-11-05T20:00:00.000Z'); // already Nov 6 in Kolkata
    must(
      await createActivity(h.deps, {
        name: 'Zone check',
        type: 'routine',
        schedule: { strategy: daily, timeZone: 'Asia/Kolkata', startsOn: '2026-11-05' },
      }),
    );
    expect((await getDashboard(h.repos, h.clock, { timeZone: KOLKATA })).today).toBe('2026-11-06');
    const newYork = 'America/New_York' as TimeZoneId;
    expect((await getDashboard(h.repos, h.clock, { timeZone: newYork })).today).toBe('2026-11-05');
  });

  it('keeps skipped work out of the lists', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Skip me',
        type: 'routine',
        schedule: weeklyFrom('2026-11-05'),
      }),
    );
    must(await skipOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    const d = await getDashboard(h.repos, h.clock, { timeZone: KOLKATA });
    expect(d.dueToday).toEqual([]);
  });
});

describe('listActivities', () => {
  it('lists activities with schedules and next due date, with search and archive handling', async () => {
    const h = createHarness();
    must(
      await createActivity(h.deps, {
        name: 'Clean AC filter',
        type: 'maintenance',
        schedule: weeklyFrom('2026-11-05'),
      }),
    );
    must(await createActivity(h.deps, { name: 'Buy gift', type: 'administrative' }));
    const old = must(await createActivity(h.deps, { name: 'Old chore', type: 'routine' }));
    must(await archiveActivity(h.deps, { activityId: old.activity.id }));

    const all = await listActivities(h.repos);
    expect(all.map((i) => [i.activity.name, i.nextDueOn ?? null, i.schedules.length])).toEqual([
      ['Buy gift', null, 0],
      ['Clean AC filter', '2026-11-05', 1],
    ]);
    const found = await listActivities(h.repos, { search: 'ac f' });
    expect(found.map((i) => i.activity.name)).toEqual(['Clean AC filter']);
    expect(await listActivities(h.repos, { includeArchived: true })).toHaveLength(3);
  });
});
