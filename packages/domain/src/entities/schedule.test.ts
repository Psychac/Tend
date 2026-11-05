import type { ActivityId, LocalDate, ScheduleId, TimeZoneId } from '../core';
import { NOW, OWNER, sequentialIds } from '../testing';
import { createSchedule, type NewSchedule, type ScheduleStrategy } from './schedule';

const ids = sequentialIds();
const base = (strategy: ScheduleStrategy): NewSchedule => ({
  id: ids.next<'Schedule'>() as ScheduleId,
  ownerId: OWNER,
  now: NOW,
  activityId: ids.next<'Activity'>() as ActivityId,
  strategy,
  timeZone: 'Asia/Kolkata' as TimeZoneId,
  startsOn: '2026-11-01' as LocalDate,
});

describe('createSchedule', () => {
  it('accepts a valid weekly schedule and defaults the policy', () => {
    const r = createSchedule(
      base({ kind: 'calendar', interval: { every: 1, unit: 'week' }, byWeekday: [1, 4] }),
    );
    expect(r.ok && r.value.policy).toEqual({ graceDays: 0 });
  });

  it('rejects a non-positive or fractional interval', () => {
    expect(createSchedule(base({ kind: 'calendar', interval: { every: 0, unit: 'day' } })).ok).toBe(
      false,
    );
    expect(
      createSchedule(base({ kind: 'completion_interval', interval: { every: 1.5, unit: 'day' } }))
        .ok,
    ).toBe(false);
  });

  it('rejects weekday or month-day rules on the wrong interval unit', () => {
    expect(
      createSchedule(
        base({ kind: 'calendar', interval: { every: 1, unit: 'month' }, byWeekday: [1] }),
      ).ok,
    ).toBe(false);
    expect(
      createSchedule(
        base({ kind: 'calendar', interval: { every: 1, unit: 'week' }, byMonthDay: 15 }),
      ).ok,
    ).toBe(false);
    expect(
      createSchedule(
        base({ kind: 'calendar', interval: { every: 1, unit: 'month' }, byMonthDay: 32 }),
      ).ok,
    ).toBe(false);
  });

  it('rejects an end date before the start and a negative grace period', () => {
    const input = base({ kind: 'calendar', interval: { every: 1, unit: 'day' } });
    expect(createSchedule({ ...input, endsOn: '2026-10-01' as LocalDate }).ok).toBe(false);
    expect(createSchedule({ ...input, policy: { graceDays: -1 } }).ok).toBe(false);
  });

  it('validates usage schedules', () => {
    expect(
      createSchedule(base({ kind: 'usage', every: { value: 0, unit: 'km' }, meterKey: 'odometer' }))
        .ok,
    ).toBe(false);
    expect(
      createSchedule(base({ kind: 'usage', every: { value: 1000, unit: 'km' }, meterKey: ' ' })).ok,
    ).toBe(false);
    expect(
      createSchedule(
        base({ kind: 'usage', every: { value: 1000, unit: 'km' }, meterKey: 'odometer' }),
      ).ok,
    ).toBe(true);
  });
});
