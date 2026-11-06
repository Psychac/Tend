import type { ActivityId, Instant, LocalDate, OccurrenceId, ScheduleId, TimeZoneId } from '../core';
import { newMeta, type Occurrence, type Schedule, type ScheduleStrategy } from '../entities';
import { NOW, OWNER, sequentialIds } from '../testing';
import {
  conditionMet,
  crossedCondition,
  eventDueDate,
  HARD_MAX_OCCURRENCES,
  missingDueDates,
  nextUsageThreshold,
  type GenerationContext,
} from './generate';
import { addDays, addMonths, addYears, daysBetween, isoWeekday } from './local-date';
import {
  classifyOccurrence,
  consolidateMissed,
  pauseSchedule,
  planScheduleChange,
  rescheduleOccurrence,
  resumeSchedule,
} from './policy';
import { localDateOf, startOfDayInstant } from './zone';

const ids = sequentialIds();
const d = (s: string) => s as LocalDate;
const at = (s: string) => s as Instant;
const tz = (s: string) => s as TimeZoneId;
const TODAY = d('2026-11-05'); // a Thursday

function schedule(
  strategy: ScheduleStrategy,
  startsOn = '2026-11-01',
  extra: Partial<Schedule> = {},
) {
  const s: Schedule = {
    id: ids.next<'Schedule'>() as ScheduleId,
    meta: newMeta(OWNER, NOW),
    activityId: ids.next<'Activity'>() as ActivityId,
    strategy,
    policy: { graceDays: 0 },
    timeZone: tz('Asia/Kolkata'),
    startsOn: d(startsOn),
    ...extra,
  };
  return s;
}

const ctx = (extra: Partial<GenerationContext> = {}): GenerationContext => ({
  today: TODAY,
  existingDueDates: [],
  ...extra,
});

describe('local date arithmetic', () => {
  it('clamps month-end and leap days', () => {
    expect(addMonths(d('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonths(d('2028-01-31'), 1)).toBe('2028-02-29');
    expect(addYears(d('2024-02-29'), 1)).toBe('2025-02-28');
    expect(addMonths(d('2026-11-15'), -11)).toBe('2025-12-15');
  });

  it('handles day and weekday maths across boundaries', () => {
    expect(addDays(d('2026-12-31'), 1)).toBe('2027-01-01');
    expect(daysBetween(d('2026-11-05'), d('2026-12-05'))).toBe(30);
    expect(isoWeekday(d('2026-11-05'))).toBe(4);
    expect(isoWeekday(d('2026-11-08'))).toBe(7);
  });
});

describe('timezone and DST', () => {
  it('maps an instant to the local date in the zone', () => {
    // 20:00Z is already the next day in Kolkata (UTC+5:30) but still the same day in UTC.
    expect(localDateOf(at('2026-11-05T20:00:00Z'), tz('Asia/Kolkata'))).toBe('2026-11-06');
    expect(localDateOf(at('2026-11-05T20:00:00Z'), tz('UTC'))).toBe('2026-11-05');
    expect(localDateOf(at('2026-11-05T03:00:00Z'), tz('America/New_York'))).toBe('2026-11-04');
  });

  it('finds local midnight across a fixed offset', () => {
    expect(startOfDayInstant(d('2026-11-05'), tz('Asia/Kolkata'))).toBe('2026-11-04T18:30:00.000Z');
  });

  it('finds local midnight on either side of US DST changes', () => {
    // Spring forward 2026-03-08: midnight is still EST (UTC-5).
    expect(startOfDayInstant(d('2026-03-08'), tz('America/New_York'))).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    // The day after is EDT (UTC-4).
    expect(startOfDayInstant(d('2026-03-09'), tz('America/New_York'))).toBe(
      '2026-03-09T04:00:00.000Z',
    );
    // Fall back 2026-11-01: midnight is still EDT.
    expect(startOfDayInstant(d('2026-11-01'), tz('America/New_York'))).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(startOfDayInstant(d('2026-11-02'), tz('America/New_York'))).toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });

  it('returns the first valid instant when local midnight does not exist', () => {
    // Havana springs forward at 00:00 -> 01:00 on 2026-03-08, so the day starts at 01:00 local.
    expect(startOfDayInstant(d('2026-03-08'), tz('America/Havana'))).toBe(
      '2026-03-08T05:00:00.000Z',
    );
  });

  it('keeps a 25-hour DST day as one calendar day', () => {
    const start = startOfDayInstant(d('2026-11-01'), tz('America/New_York'));
    const end = startOfDayInstant(d('2026-11-02'), tz('America/New_York'));
    expect((Date.parse(end) - Date.parse(start)) / 3_600_000).toBe(25);
  });
});

describe('missingDueDates: calendar', () => {
  it('daily every N days', () => {
    const s = schedule({ kind: 'calendar', interval: { every: 3, unit: 'day' } });
    expect(missingDueDates(s, ctx({ horizonDays: 10 }))).toEqual([
      '2026-11-07',
      '2026-11-10',
      '2026-11-13',
    ]);
  });

  it('weekly on several weekdays', () => {
    const s = schedule(
      { kind: 'calendar', interval: { every: 1, unit: 'week' }, byWeekday: [4, 1] },
      '2026-11-02',
    );
    expect(missingDueDates(s, ctx({ horizonDays: 10 }))).toEqual([
      '2026-11-05',
      '2026-11-09',
      '2026-11-12',
    ]);
  });

  it('every second week skips the off weeks', () => {
    const s = schedule(
      { kind: 'calendar', interval: { every: 2, unit: 'week' }, byWeekday: [1] },
      '2026-11-02',
    );
    expect(missingDueDates(s, ctx({ horizonDays: 30 }))).toEqual(['2026-11-16', '2026-11-30']);
  });

  it('monthly clamps the 31st to shorter months without drifting', () => {
    const s = schedule({ kind: 'calendar', interval: { every: 1, unit: 'month' } }, '2026-01-31');
    expect(missingDueDates(s, ctx({ today: d('2026-02-01'), horizonDays: 60 }))).toEqual([
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('yearly on a leap day falls back to Feb 28, then returns to Feb 29', () => {
    const s = schedule({ kind: 'calendar', interval: { every: 1, unit: 'year' } }, '2024-02-29');
    expect(missingDueDates(s, ctx({ today: d('2027-01-01'), horizonDays: 90 }))).toEqual([
      '2027-02-28',
    ]);
    expect(missingDueDates(s, ctx({ today: d('2028-01-01'), horizonDays: 90 }))).toEqual([
      '2028-02-29',
    ]);
  });

  it('does not start before startsOn or run past endsOn', () => {
    const future = schedule(
      { kind: 'calendar', interval: { every: 1, unit: 'day' } },
      '2026-11-07',
    );
    expect(missingDueDates(future, ctx({ horizonDays: 3 }))[0]).toBe('2026-11-07');
    const ending = schedule(
      { kind: 'calendar', interval: { every: 1, unit: 'day' } },
      '2026-11-01',
      {
        endsOn: d('2026-11-07'),
      },
    );
    expect(missingDueDates(ending, ctx())).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
  });
});

describe('missingDueDates: other strategies', () => {
  it('fixed interval is anchored, so month-end clamping does not accumulate', () => {
    const s = schedule(
      { kind: 'fixed_interval', interval: { every: 1, unit: 'month' }, anchor: d('2026-01-31') },
      '2026-01-31',
    );
    expect(missingDueDates(s, ctx({ today: d('2026-02-01'), horizonDays: 90 }))).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('completion interval runs from the last completion, early or late', () => {
    const s = schedule({ kind: 'completion_interval', interval: { every: 30, unit: 'day' } });
    expect(missingDueDates(s, ctx({ lastResolvedOn: d('2026-11-01') }))).toEqual(['2026-12-01']);
    expect(missingDueDates(s, ctx())).toEqual(['2026-11-01']); // first one is due on startsOn
  });

  it('usage is due once the meter advances by the interval', () => {
    const s = schedule({ kind: 'usage', every: { value: 1000, unit: 'km' }, meterKey: 'odometer' });
    expect(
      missingDueDates(s, ctx({ usage: { lastServiceReading: 41000, currentReading: 41500 } })),
    ).toEqual([]);
    expect(
      missingDueDates(s, ctx({ usage: { lastServiceReading: 41000, currentReading: 42050 } })),
    ).toEqual([TODAY]);
    if (s.strategy.kind === 'usage') expect(nextUsageThreshold(s.strategy, 41000)).toBe(42000);
  });

  it('condition and event strategies are not date-generated', () => {
    expect(
      missingDueDates(
        schedule({ kind: 'condition', measurementKey: 'tread', comparator: 'lt', threshold: 3 }),
        ctx(),
      ),
    ).toEqual([]);
    expect(
      missingDueDates(
        schedule({ kind: 'event', afterActivityId: 'a-other' as ActivityId, delayDays: 7 }),
        ctx(),
      ),
    ).toEqual([]);
  });

  it('a condition fires on the crossing only, and re-arms after returning', () => {
    const s = {
      kind: 'condition',
      measurementKey: 'ph',
      comparator: 'gt',
      threshold: 7.5,
    } as const;
    expect(conditionMet(s, 7.5)).toBe(false);
    expect(crossedCondition(s, 7.2, 7.6)).toBe(true);
    expect(crossedCondition(s, undefined, 7.6)).toBe(true);
    expect(crossedCondition(s, 7.6, 7.9)).toBe(false);
    expect(crossedCondition(s, 7.9, 7.2)).toBe(false);
    expect(crossedCondition(s, 7.2, 7.8)).toBe(true);
    expect(crossedCondition({ ...s, comparator: 'lte' }, 7.6, 7.5)).toBe(true);
  });

  it('an event schedule falls due the delay after the triggering completion', () => {
    const s: ScheduleStrategy = {
      kind: 'event',
      afterActivityId: 'a-other' as ActivityId,
      delayDays: 7,
    };
    if (s.kind === 'event') {
      expect(eventDueDate(s, d('2026-11-05'))).toBe('2026-11-12');
      expect(eventDueDate({ ...s, delayDays: 0 }, d('2026-11-05'))).toBe('2026-11-05');
    }
  });
});

describe('generation guarantees', () => {
  const daily = () => schedule({ kind: 'calendar', interval: { every: 1, unit: 'day' } });

  it('is idempotent: re-running with its own output adds nothing', () => {
    const first = missingDueDates(daily(), ctx());
    expect(first.length).toBeGreaterThan(0);
    expect(missingDueDates(daily(), ctx({ existingDueDates: first }))).toEqual([]);
  });

  it('only fills the gaps', () => {
    expect(
      missingDueDates(daily(), ctx({ horizonDays: 2, existingDueDates: [d('2026-11-06')] })),
    ).toEqual(['2026-11-05', '2026-11-07']);
  });

  it('is bounded by maxOccurrences and by the hard ceiling', () => {
    expect(missingDueDates(daily(), ctx({ horizonDays: 1000, maxOccurrences: 10 }))).toHaveLength(
      10,
    );
    expect(missingDueDates(daily(), ctx({ horizonDays: 5000, maxOccurrences: 5000 }))).toHaveLength(
      HARD_MAX_OCCURRENCES,
    );
    expect(missingDueDates(daily(), ctx({ maxOccurrences: 0 }))).toEqual([]);
  });

  it('copes with a schedule that started years ago', () => {
    const old = schedule({ kind: 'calendar', interval: { every: 1, unit: 'day' } }, '2000-01-01');
    expect(missingDueDates(old, ctx({ horizonDays: 2 }))).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
  });

  it('generates nothing while paused and does not back-fill after resume', () => {
    const paused = pauseSchedule(daily(), NOW);
    if (!paused.ok) throw new Error('setup failed');
    expect(missingDueDates(paused.value, ctx())).toEqual([]);
    const resumed = resumeSchedule(paused.value, at('2026-11-20T09:00:00.000Z'));
    if (!resumed.ok) throw new Error('setup failed');
    const dates = missingDueDates(resumed.value, ctx({ today: d('2026-11-20'), horizonDays: 1 }));
    expect(dates).toEqual(['2026-11-20', '2026-11-21']);
  });
});

describe('occurrence policies', () => {
  const occ = (
    dueOn: string,
    status: Occurrence['status'] = 'pending',
    activity?: ActivityId,
  ): Occurrence => ({
    id: ids.next<'Occurrence'>() as OccurrenceId,
    meta: newMeta(OWNER, NOW),
    activityId: activity ?? (ids.next<'Activity'>() as ActivityId),
    dueOn: d(dueOn),
    status,
  });

  it('classifies against the grace period', () => {
    const o = occ('2026-11-05');
    expect(classifyOccurrence(o, 2, d('2026-11-04'))).toBe('upcoming');
    expect(classifyOccurrence(o, 2, d('2026-11-05'))).toBe('due');
    expect(classifyOccurrence(o, 2, d('2026-11-07'))).toBe('in_grace');
    expect(classifyOccurrence(o, 2, d('2026-11-08'))).toBe('overdue');
    expect(classifyOccurrence(occ('2026-11-05', 'completed'), 2, TODAY)).toBeNull();
  });

  it('measures a snoozed occurrence from its snooze date', () => {
    const snoozed: Occurrence = { ...occ('2026-11-05', 'snoozed'), snoozedUntil: d('2026-11-09') };
    expect(classifyOccurrence(snoozed, 0, d('2026-11-07'))).toBe('upcoming');
    expect(classifyOccurrence(snoozed, 0, d('2026-11-09'))).toBe('due');
  });

  it('reschedules outstanding work only', () => {
    const moved = rescheduleOccurrence(occ('2026-11-05'), d('2026-11-12'), NOW);
    expect(moved.ok && moved.value.dueOn).toBe('2026-11-12');
    expect(rescheduleOccurrence(occ('2026-11-05', 'completed'), d('2026-11-12'), NOW).ok).toBe(
      false,
    );
  });

  it('refuses to pause twice or resume when not paused', () => {
    const s = schedule({ kind: 'calendar', interval: { every: 1, unit: 'day' } });
    expect(resumeSchedule(s, NOW).ok).toBe(false);
    const paused = pauseSchedule(s, NOW);
    if (!paused.ok) throw new Error('setup failed');
    expect(pauseSchedule(paused.value, NOW).ok).toBe(false);
    expect(paused.value.meta.version).toBe(2);
  });

  it('consolidates a pile of missed occurrences into the most recent one', () => {
    const activity = ids.next<'Activity'>() as ActivityId;
    const other = occ('2026-10-01');
    const missed = [
      occ('2026-10-28', 'pending', activity),
      occ('2026-11-01', 'pending', activity),
      occ('2026-11-03', 'pending', activity),
    ];
    const future = occ('2026-11-10', 'pending', activity);
    const done = occ('2026-10-20', 'completed', activity);
    const result = consolidateMissed([...missed, future, done, other], TODAY, NOW);
    expect(result.map((o) => o.dueOn).sort()).toEqual(['2026-10-28', '2026-11-01']);
    expect(result.every((o) => o.status === 'missed')).toBe(true);
  });

  it('applies an explicit policy when a schedule changes', () => {
    const overdue = occ('2026-11-01');
    const keep = occ('2026-11-12');
    const drop = occ('2026-11-13');
    const all = [overdue, keep, drop];
    const wanted = [d('2026-11-12')];

    const supersede = planScheduleChange(all, wanted, 'supersede_future', TODAY, NOW);
    expect(supersede.superseded.map((o) => o.dueOn)).toEqual(['2026-11-13']);
    expect(supersede.keptDueDates.sort()).toEqual(['2026-11-01', '2026-11-12']);

    const keepAll = planScheduleChange(all, wanted, 'keep_outstanding', TODAY, NOW);
    expect(keepAll.superseded).toEqual([]);
    expect(keepAll.keptDueDates).toHaveLength(3);
  });
});
