import type { Instant, Result, TimeZoneId } from '@upkeep/domain';
import {
  archiveActivity,
  completeOccurrence,
  createActivity,
  deliverDueReminders,
  getActivityReminder,
  getReminderStatus,
  setActivitySchedule,
  setActivityReminder,
  snoozeOccurrence,
  type ReminderBatch,
} from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

const KOLKATA = 'Asia/Kolkata' as TimeZoneId;
const weekly = {
  strategy: { kind: 'calendar', interval: { every: 1, unit: 'week' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05', // a Thursday; Nov 12 and 19 follow
} as const;

/** A fake delivery channel that records what it was asked to show. */
function channel(result = true) {
  const shown: ReminderBatch[] = [];
  return {
    shown,
    deliver: async (batch: ReminderBatch) => {
      shown.push(batch);
      return result;
    },
  };
}

const at = (iso: string) => iso as Instant;

describe('setActivityReminder', () => {
  it('creates a reminder, then changes the same one, and can switch it off without losing it', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Clean AC', type: 'maintenance', schedule: weekly }),
    );

    const first = must(
      await setActivityReminder(h.deps, {
        activityId: a.activity.id,
        leadDays: 1,
        atTime: '08:00',
        enabled: true,
      }),
    );
    expect(first).toMatchObject({ leadDays: 1, atTime: '08:00', enabled: true });

    const second = must(
      await setActivityReminder(h.deps, {
        activityId: a.activity.id,
        leadDays: 0,
        atTime: '18:30',
        enabled: true,
      }),
    );
    expect(second.id).toBe(first.id);
    expect(second.meta.version).toBe(first.meta.version + 1);

    must(
      await setActivityReminder(h.deps, {
        activityId: a.activity.id,
        leadDays: 0,
        atTime: '18:30',
        enabled: false,
      }),
    );
    const stored = await getActivityReminder(h.repos, a.activity.id);
    expect(stored).toMatchObject({ enabled: false, atTime: '18:30' });
    expect(await h.repos.reminders.list()).toHaveLength(1);
  });

  it('explains bad input and unknown activities', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'Chore', type: 'routine' }));
    const badTime = await setActivityReminder(h.deps, {
      activityId: a.activity.id,
      leadDays: 0,
      atTime: '25:00',
      enabled: true,
    });
    expect(!badTime.ok && badTime.error.issues[0]?.path).toBe('atTime');
    const unknown = await setActivityReminder(h.deps, {
      activityId: 'nope' as never,
      leadDays: 0,
      atTime: '09:00',
      enabled: true,
    });
    expect(!unknown.ok && unknown.error.code).toBe('not_found');
    expect(await getActivityReminder(h.repos, a.activity.id)).toBeNull();
  });
});

describe('getReminderStatus', () => {
  async function setup(leadDays: number, atTime = '09:00') {
    const h = createHarness(); // Thu 2026-11-05 12:00 Kolkata
    const a = must(
      await createActivity(h.deps, { name: 'Clean AC', type: 'maintenance', schedule: weekly }),
    );
    must(
      await setActivityReminder(h.deps, {
        activityId: a.activity.id,
        leadDays,
        atTime,
        enabled: true,
      }),
    );
    return { h, a };
  }

  it('has nothing fired before the reminder time, and says what comes next', async () => {
    const { h } = await setup(1, '09:00'); // for Nov 12 -> fires Nov 11 09:00 Kolkata
    h.clock.set('2026-11-05T06:30:00.000Z');
    // The Nov 5 occurrence's reminder (Nov 4 09:00) already passed; later ones are still to come.
    const status = await getReminderStatus(h.repos, { now: h.clock.now(), timeZone: KOLKATA });
    expect(status.fired.map((i) => i.dueOn)).toEqual(['2026-11-05']);
    expect(status.next?.dueOn).toBe('2026-11-12');
    expect(status.next?.fireAt).toBe('2026-11-11T03:30:00.000Z');
  });

  it('fires at the chosen time on the chosen day, and keeps showing until the work is done', async () => {
    const { h, a } = await setup(0, '09:00');
    // Before 9am on the due day: not yet.
    let status = await getReminderStatus(h.repos, {
      now: at('2026-11-05T03:00:00.000Z'),
      timeZone: KOLKATA,
    });
    expect(status.fired).toHaveLength(0);
    // After 9am: fired, with the number of days to go.
    status = await getReminderStatus(h.repos, {
      now: at('2026-11-05T04:00:00.000Z'),
      timeZone: KOLKATA,
    });
    expect(status.fired).toHaveLength(1);
    expect(status.fired[0]).toMatchObject({ daysUntilDue: 0, dueOn: '2026-11-05' });
    // Still there days later, now overdue.
    status = await getReminderStatus(h.repos, {
      now: at('2026-11-08T04:00:00.000Z'),
      timeZone: KOLKATA,
    });
    expect(status.fired[0]).toMatchObject({ daysUntilDue: -3 });
    // Done: gone.
    const occ = (await h.repos.occurrences.list({ status: ['pending'] }))[0]!;
    must(await completeOccurrence(h.deps, { occurrenceId: occ.id }));
    status = await getReminderStatus(h.repos, {
      now: at('2026-11-08T04:00:00.000Z'),
      timeZone: KOLKATA,
    });
    expect(status.fired.map((i) => i.dueOn)).not.toContain('2026-11-05');
    expect(a.activity.name).toBe('Clean AC');
  });

  it('ignores disabled reminders and archived activities', async () => {
    const { h, a } = await setup(0);
    const now = at('2026-11-05T04:00:00.000Z');
    expect((await getReminderStatus(h.repos, { now, timeZone: KOLKATA })).fired).toHaveLength(1);
    must(
      await setActivityReminder(h.deps, {
        activityId: a.activity.id,
        leadDays: 0,
        atTime: '09:00',
        enabled: false,
      }),
    );
    expect((await getReminderStatus(h.repos, { now, timeZone: KOLKATA })).fired).toHaveLength(0);
    must(
      await setActivityReminder(h.deps, {
        activityId: a.activity.id,
        leadDays: 0,
        atTime: '09:00',
        enabled: true,
      }),
    );
    must(await archiveActivity(h.deps, { activityId: a.activity.id }));
    expect((await getReminderStatus(h.repos, { now, timeZone: KOLKATA })).fired).toHaveLength(0);
  });

  it('follows a snooze, so the reminder moves with the new date', async () => {
    const { h } = await setup(0, '09:00');
    const occ = (await h.repos.occurrences.list({ status: ['pending'] }))[0]!;
    h.clock.set('2026-11-05T04:00:00.000Z');
    must(await snoozeOccurrence(h.deps, { occurrenceId: occ.id, until: '2026-11-07' as never }));
    const status = await getReminderStatus(h.repos, {
      now: at('2026-11-05T05:00:00.000Z'),
      timeZone: KOLKATA,
    });
    expect(status.fired).toHaveLength(0); // moved to Nov 7
  });

  it('survives the schedule changing underneath it', async () => {
    const { h, a } = await setup(0);
    must(
      await setActivitySchedule(h.deps, {
        activityId: a.activity.id,
        schedule: {
          ...weekly,
          strategy: { kind: 'calendar', interval: { every: 1, unit: 'month' } },
        },
      }),
    );
    const status = await getReminderStatus(h.repos, {
      now: at('2026-11-05T04:00:00.000Z'),
      timeZone: KOLKATA,
    });
    expect(status.fired.map((i) => i.dueOn)).toEqual(['2026-11-05']);
  });
});

describe('deliverDueReminders', () => {
  async function setup() {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Clean AC', type: 'maintenance', schedule: weekly }),
    );
    const b = must(
      await createActivity(h.deps, { name: 'Water plants', type: 'routine', schedule: weekly }),
    );
    for (const x of [a, b]) {
      must(
        await setActivityReminder(h.deps, {
          activityId: x.activity.id,
          leadDays: 0,
          atTime: '09:00',
          enabled: true,
        }),
      );
    }
    h.clock.set('2026-11-05T04:00:00.000Z'); // after 9am Kolkata on the due day
    return h;
  }

  it('delivers everything due as one batch, then never again', async () => {
    const h = await setup();
    const out = channel();
    const first = must(
      await deliverDueReminders(h.deps, {
        now: h.clock.now(),
        timeZone: KOLKATA,
        deliver: out.deliver,
      }),
    );
    expect(first.delivered).toBe(2);
    expect(out.shown).toHaveLength(1);
    expect(out.shown[0]?.items.map((i) => i.activity.name).sort()).toEqual([
      'Clean AC',
      'Water plants',
    ]);

    const again = must(
      await deliverDueReminders(h.deps, {
        now: h.clock.now(),
        timeZone: KOLKATA,
        deliver: out.deliver,
      }),
    );
    expect(again.delivered).toBe(0);
    expect(out.shown).toHaveLength(1); // the channel was not even asked
  });

  it('delivers only what is new when more comes due later', async () => {
    const h = await setup();
    const out = channel();
    await deliverDueReminders(h.deps, {
      now: h.clock.now(),
      timeZone: KOLKATA,
      deliver: out.deliver,
    });
    h.clock.set('2026-11-12T04:00:00.000Z'); // a week later: next occurrences' reminders fire
    const later = must(
      await deliverDueReminders(h.deps, {
        now: h.clock.now(),
        timeZone: KOLKATA,
        deliver: out.deliver,
      }),
    );
    // The Nov 5 items are still outstanding but were already delivered; only Nov 12 is new.
    expect(later.delivered).toBe(2);
    expect(out.shown[1]?.items.every((i) => i.dueOn === '2026-11-12')).toBe(true);
  });

  it('does not mark anything delivered when the channel declines, and offers it again later', async () => {
    const h = await setup();
    const refusing = channel(false);
    const none = must(
      await deliverDueReminders(h.deps, {
        now: h.clock.now(),
        timeZone: KOLKATA,
        deliver: refusing.deliver,
      }),
    );
    expect(none.delivered).toBe(0);
    expect(await h.repos.reminderDeliveries.list()).toHaveLength(0);

    const working = channel(true);
    const ok = must(
      await deliverDueReminders(h.deps, {
        now: h.clock.now(),
        timeZone: KOLKATA,
        deliver: working.deliver,
      }),
    );
    expect(ok.delivered).toBe(2);
  });

  it('treats a channel that throws as not delivered', async () => {
    const h = await setup();
    const result = must(
      await deliverDueReminders(h.deps, {
        now: h.clock.now(),
        timeZone: KOLKATA,
        deliver: async () => {
          throw new Error('notification blocked');
        },
      }),
    );
    expect(result.delivered).toBe(0);
    expect(await h.repos.reminderDeliveries.list()).toHaveLength(0);
  });

  it('delivers again after a snooze moves the due date', async () => {
    const h = await setup();
    const out = channel();
    await deliverDueReminders(h.deps, {
      now: h.clock.now(),
      timeZone: KOLKATA,
      deliver: out.deliver,
    });
    const occ = (await h.repos.occurrences.list({ status: ['pending'] })).find(
      (o) => o.dueOn === '2026-11-05',
    )!;
    must(await snoozeOccurrence(h.deps, { occurrenceId: occ.id, until: '2026-11-07' as never }));

    h.clock.set('2026-11-07T04:00:00.000Z');
    const again = must(
      await deliverDueReminders(h.deps, {
        now: h.clock.now(),
        timeZone: KOLKATA,
        deliver: out.deliver,
      }),
    );
    expect(again.delivered).toBeGreaterThan(0);
    expect(out.shown.at(-1)?.items.some((i) => i.dueOn === '2026-11-07')).toBe(true);
  });
});
