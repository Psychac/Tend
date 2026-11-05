import type {
  ActivityId,
  Instant,
  LocalDate,
  OccurrenceId,
  ReminderId,
  TimeZoneId,
  UserId,
} from '../core';
import { createReminder, deliveryKey, reminderFireTime } from './reminder';
import type { Occurrence } from './occurrence';
import { newMeta } from './meta';

const KOLKATA = 'Asia/Kolkata' as TimeZoneId;
const NOW = '2026-11-05T06:30:00.000Z' as Instant;
const base = {
  id: 'r1' as ReminderId,
  ownerId: 'u1' as UserId,
  now: NOW,
  activityId: 'a1' as ActivityId,
};
const occurrence = (dueOn: string, snoozedUntil?: string): Occurrence => ({
  id: 'o1' as OccurrenceId,
  meta: newMeta('u1' as UserId, NOW),
  activityId: 'a1' as ActivityId,
  dueOn: dueOn as LocalDate,
  status: snoozedUntil ? 'snoozed' : 'pending',
  snoozedUntil: snoozedUntil as LocalDate | undefined,
});

describe('createReminder', () => {
  it('defaults to the day itself at 09:00, enabled', () => {
    const r = createReminder(base);
    expect(r).toMatchObject({ ok: true, value: { leadDays: 0, atTime: '09:00', enabled: true } });
  });

  it('rejects impossible lead times and times of day', () => {
    for (const bad of [{ leadDays: -1 }, { leadDays: 1.5 }, { leadDays: 366 }]) {
      const r = createReminder({ ...base, ...bad });
      expect(!r.ok && r.error.issues[0]?.path).toBe('leadDays');
    }
    for (const atTime of ['24:00', '9:00', '09:60', 'noon', '']) {
      const r = createReminder({ ...base, atTime });
      expect(!r.ok && r.error.issues[0]?.path).toBe('atTime');
    }
  });
});

describe('reminderFireTime', () => {
  const reminder = (leadDays: number, atTime: string) => {
    const r = createReminder({ ...base, leadDays, atTime });
    if (!r.ok) throw new Error('bad reminder');
    return r.value;
  };

  it('fires on the due day, or some days before, at the chosen wall-clock time', () => {
    expect(reminderFireTime(reminder(0, '09:00'), occurrence('2026-11-12'), KOLKATA)).toBe(
      '2026-11-12T03:30:00.000Z',
    );
    expect(reminderFireTime(reminder(2, '18:30'), occurrence('2026-11-12'), KOLKATA)).toBe(
      '2026-11-10T13:00:00.000Z',
    );
  });

  it('follows a snooze, because the due date moved', () => {
    expect(
      reminderFireTime(reminder(0, '09:00'), occurrence('2026-11-12', '2026-11-14'), KOLKATA),
    ).toBe('2026-11-14T03:30:00.000Z');
  });

  it('reads the clock in the given zone, including across month ends', () => {
    expect(
      reminderFireTime(
        reminder(1, '09:00'),
        occurrence('2026-12-01'),
        'America/New_York' as TimeZoneId,
      ),
    ).toBe('2026-11-30T14:00:00.000Z');
  });
});

describe('deliveryKey', () => {
  it('changes when the due date changes, so a snooze re-arms the reminder', () => {
    const a = deliveryKey('r1' as ReminderId, 'o1' as OccurrenceId, '2026-11-12' as LocalDate);
    const b = deliveryKey('r1' as ReminderId, 'o1' as OccurrenceId, '2026-11-14' as LocalDate);
    expect(a).not.toBe(b);
  });
});
