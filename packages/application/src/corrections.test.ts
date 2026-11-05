import { createCompletion, type Result, type TimeZoneId } from '@tend/domain';
import {
  completeOccurrence,
  correctCompletion,
  createActivity,
  createAsset,
  getCalendarMonth,
  getDashboard,
  getHistory,
  getInsights,
  recordMeasurement,
  undoCompletion,
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
const afterCompletion = {
  strategy: { kind: 'completion_interval', interval: { every: 30, unit: 'day' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05',
} as const;

const history = (h: ReturnType<typeof createHarness>) => getHistory(h.repos, { timeZone: KOLKATA });

describe('undoCompletion', () => {
  it('stops the completion counting and puts the work back to due', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Clean AC', type: 'maintenance', schedule: daily }),
    );
    const done = must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[0]!.id,
        cost: { minor: 5000, currency: 'INR' },
      }),
    );

    const result = must(await undoCompletion(h.deps, { completionId: done.completion.id }));
    expect(result.reopened?.status).toBe('pending');

    // It no longer appears as done, and the work is due again.
    expect((await history(h)).entries).toHaveLength(0);
    const dashboard = await getDashboard(h.repos, h.clock, { timeZone: KOLKATA });
    expect(dashboard.recentCompletions).toHaveLength(0);
    expect(dashboard.dueToday.map((i) => i.activity.name)).toEqual(['Clean AC']);
    // It is hidden, not deleted.
    expect(await h.repos.completions.getById(done.completion.id)).not.toBeNull();
    expect(await h.repos.completions.list({ includeVoided: true })).toHaveLength(1);
    expect(await h.repos.completions.list({})).toHaveLength(0);
  });

  it('removes the entry from insights and the calendar', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    const done = must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[0]!.id,
        cost: { minor: 700, currency: 'USD' },
      }),
    );
    must(await undoCompletion(h.deps, { completionId: done.completion.id }));

    const insights = await getInsights(h.repos, {
      today: '2026-11-05' as never,
      timeZone: KOLKATA,
    });
    expect(insights.completed).toBe(0);
    expect(insights.spend).toEqual([]);

    const cal = await getCalendarMonth(h.repos, {
      year: 2026,
      month: 11,
      today: '2026-11-05' as never,
      timeZone: KOLKATA,
    });
    const day = cal.weeks.flat().find((d) => d.date === '2026-11-05')!;
    expect(day.entries.map((e) => e.kind)).toEqual(['due']);
  });

  it('hides the readings recorded with it, so a meter is not skewed', async () => {
    const h = createHarness();
    const car = must(await createAsset(h.deps, { name: 'Car' }));
    const a = must(
      await createActivity(h.deps, {
        name: 'Service',
        type: 'maintenance',
        assetId: car.id,
        schedule: daily,
      }),
    );
    must(
      await recordMeasurement(h.deps, {
        assetId: car.id,
        measurement: { kind: 'numeric', key: 'odometer', value: 1000, unit: 'km' },
      }),
    );
    const done = must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[0]!.id,
        measurements: [{ kind: 'numeric', key: 'odometer', value: 99999, unit: 'km' }],
      }),
    );
    expect(await h.repos.measurements.list({ assetId: car.id })).toHaveLength(2);

    must(await undoCompletion(h.deps, { completionId: done.completion.id }));
    const left = await h.repos.measurements.list({ assetId: car.id });
    expect(left).toHaveLength(1);
    expect(left[0]?.value).toMatchObject({ quantity: { value: 1000 } });
  });

  it('for an after-completion schedule, removes the follow-on item so only one stays open', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Descale kettle',
        type: 'cleaning',
        schedule: afterCompletion,
      }),
    );
    const done = must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    expect(done.nextOccurrences).toHaveLength(1); // due in 30 days

    const result = must(await undoCompletion(h.deps, { completionId: done.completion.id }));
    expect(result.superseded).toBe(1);
    const open = await h.repos.occurrences.list({ status: ['pending', 'snoozed'] });
    expect(open).toHaveLength(1);
    expect(open[0]?.dueOn).toBe('2026-11-05');
  });

  it('can be completed again after an undo', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    const done = must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    must(await undoCompletion(h.deps, { completionId: done.completion.id }));
    must(
      await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id, notes: 'properly' }),
    );
    const entries = (await history(h)).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind === 'completed' && entries[0].completion.notes).toBe('properly');
  });

  it('refuses a second undo and unknown ids', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    const done = must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    must(await undoCompletion(h.deps, { completionId: done.completion.id }));
    const again = await undoCompletion(h.deps, { completionId: done.completion.id });
    expect(!again.ok && again.error.code).toBe('invariant');
    const unknown = await undoCompletion(h.deps, { completionId: 'nope' as never });
    expect(!unknown.ok && unknown.error.code).toBe('not_found');
  });
});

describe('correctCompletion', () => {
  it('replaces the entry with a corrected one, on the same day, without redoing anything', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Service car',
        type: 'maintenance',
        checklist: ['Oil'],
        schedule: daily,
      }),
    );
    const done = must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[0]!.id,
        notes: 'oil chnage',
        cost: { minor: 1500, currency: 'INR' },
      }),
    );

    h.clock.set('2026-11-06T06:30:00.000Z'); // corrected the next day
    const fixed = must(
      await correctCompletion(h.deps, {
        completionId: done.completion.id,
        details: {
          notes: 'oil change',
          cost: { minor: 1550, currency: 'USD' },
          checklistResults: [{ itemId: a.activity.checklist[0]!.id, done: true }],
        },
      }),
    );

    // One entry shown: the corrected one, still on the original day, marked as edited.
    const entries = (await history(h)).entries;
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    if (entry.kind !== 'completed') throw new Error('expected a completion');
    expect(entry.completion.id).toBe(fixed.completion.id);
    expect(entry.completion.notes).toBe('oil change');
    expect(entry.completion.cost).toEqual({ minor: 1550, currency: 'USD' });
    expect(entry.completion.completedAt).toBe(done.completion.completedAt);
    expect(entry.edited).toBe(true);
    expect(entry.checklistDone).toBe(1);
    // The work stays done: nothing is due again, and the original is still on record.
    const open = await h.repos.occurrences.list({ status: ['pending'] });
    expect(open.map((o) => o.dueOn)).not.toContain('2026-11-05');
    expect(await h.repos.completions.list({ includeVoided: true })).toHaveLength(2);
    // Spending counts only the corrected amount.
    const insights = await getInsights(h.repos, {
      today: '2026-11-06' as never,
      timeZone: KOLKATA,
    });
    expect(insights.spend).toEqual([{ currency: 'USD', minor: 1550 }]);
  });

  it('replaces readings rather than adding to them', async () => {
    const h = createHarness();
    const car = must(await createAsset(h.deps, { name: 'Car' }));
    const a = must(
      await createActivity(h.deps, {
        name: 'Service',
        type: 'maintenance',
        assetId: car.id,
        measurementRequirements: [{ key: 'odometer', unit: 'km', required: true }],
        schedule: daily,
      }),
    );
    const done = must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[0]!.id,
        measurements: [{ kind: 'numeric', key: 'odometer', value: 120000, unit: 'km' }], // typo
      }),
    );
    must(
      await correctCompletion(h.deps, {
        completionId: done.completion.id,
        details: { measurements: [{ kind: 'numeric', key: 'odometer', value: 12000, unit: 'km' }] },
      }),
    );
    const readings = await h.repos.measurements.list({ assetId: car.id });
    expect(readings).toHaveLength(1);
    expect(readings[0]?.value).toMatchObject({ quantity: { value: 12000 } });
  });

  it('applies the same checks as completing, and changes nothing when they fail', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Service',
        type: 'maintenance',
        measurementRequirements: [{ key: 'odometer', unit: 'km', required: true }],
        schedule: daily,
      }),
    );
    const done = must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[0]!.id,
        measurements: [{ kind: 'numeric', key: 'odometer', value: 100, unit: 'km' }],
      }),
    );
    const bad = await correctCompletion(h.deps, { completionId: done.completion.id, details: {} });
    expect(!bad.ok && bad.error.issues[0]?.message).toMatch(/odometer is required/);
    expect(await h.repos.completions.list({ includeVoided: true })).toHaveLength(1);
    expect((await history(h)).entries).toHaveLength(1);
  });

  it('can be corrected more than once, and an old version cannot be corrected again', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    const first = must(
      await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id, notes: 'v1' }),
    );
    const second = must(
      await correctCompletion(h.deps, {
        completionId: first.completion.id,
        details: { notes: 'v2' },
      }),
    );
    const third = must(
      await correctCompletion(h.deps, {
        completionId: second.completion.id,
        details: { notes: 'v3' },
      }),
    );
    const stale = await correctCompletion(h.deps, {
      completionId: first.completion.id,
      details: { notes: 'x' },
    });
    expect(!stale.ok && stale.error.code).toBe('invariant');

    const entries = (await history(h)).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind === 'completed' && entries[0].completion.id).toBe(third.completion.id);
  });

  it('an edited entry can itself be undone', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    const first = must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    const fixed = must(
      await correctCompletion(h.deps, {
        completionId: first.completion.id,
        details: { notes: 'fixed' },
      }),
    );
    const undone = must(await undoCompletion(h.deps, { completionId: fixed.completion.id }));
    expect(undone.reopened?.status).toBe('pending');
    expect((await history(h)).entries).toHaveLength(0);
  });
});

describe('correcting unplanned work', () => {
  it('can edit and undo a completion that was never part of a schedule', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'Fix gate', type: 'maintenance' }));
    const made = createCompletion({
      id: h.deps.ids.next<'Completion'>(),
      ownerId: h.deps.ownerId,
      now: h.clock.now(),
      activityId: a.activity.id,
      notes: 'sticky hinge',
    });
    const unplanned = must(made);
    await h.repos.completions.add(unplanned);

    const fixed = must(
      await correctCompletion(h.deps, {
        completionId: unplanned.id,
        details: { notes: 'loose hinge' },
      }),
    );
    expect(fixed.completion.occurrenceId).toBeUndefined();
    expect(fixed.completion.plannedFor).toBeUndefined();
    const [entry] = (await history(h)).entries;
    expect(entry?.kind === 'completed' && entry.completion.notes).toBe('loose hinge');
    expect(entry?.kind === 'completed' && entry.edited).toBe(true);

    const undone = must(await undoCompletion(h.deps, { completionId: fixed.completion.id }));
    expect(undone.reopened).toBeUndefined(); // there was no scheduled work to bring back
    expect((await history(h)).entries).toHaveLength(0);
  });
});

describe('correcting when it was done', () => {
  it('moves the entry to the new day and recalculates lateness', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    h.clock.set('2026-11-08T06:30:00.000Z');
    const done = must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id })); // due Nov 5, done Nov 8

    const fixed = must(
      await correctCompletion(h.deps, {
        completionId: done.completion.id,
        details: { completedAt: '2026-11-05T10:00:00.000Z' }, // actually did it on the 5th
      }),
    );
    expect(fixed.completion.completedAt).toBe('2026-11-05T10:00:00.000Z');
    const [entry] = (await history(h)).entries;
    expect(entry?.kind === 'completed' && entry.daysFromPlanned).toBe(0);
  });

  it('refuses a date in the future and leaves the entry alone', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    const done = must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    const bad = await correctCompletion(h.deps, {
      completionId: done.completion.id,
      details: { completedAt: '2027-01-01T00:00:00.000Z' },
    });
    expect(!bad.ok && bad.error.issues[0]?.path).toBe('completedAt');
    expect(
      (await history(h)).entries[0]?.kind === 'completed' && (await history(h)).entries[0],
    ).toBeTruthy();
    expect(await h.repos.completions.list({ includeVoided: true })).toHaveLength(1);
  });

  it('recalculates the next item of an after-completion schedule from the corrected date', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Descale',
        type: 'cleaning',
        schedule: afterCompletion,
      }),
    );
    h.clock.set('2026-11-10T06:30:00.000Z');
    const done = must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    expect(done.nextOccurrences[0]?.dueOn).toBe('2026-12-10'); // 30 days after Nov 10

    must(
      await correctCompletion(h.deps, {
        completionId: done.completion.id,
        details: { completedAt: '2026-11-05T06:30:00.000Z' }, // really done on the 5th
      }),
    );
    const open = await h.repos.occurrences.list({ status: ['pending', 'snoozed'] });
    expect(open.map((o) => o.dueOn)).toEqual(['2026-12-05']); // one item, now 30 days after Nov 5
  });

  it('leaves a calendar schedule alone when the date moves', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: daily }),
    );
    const done = must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    const before = (await h.repos.occurrences.list({ status: ['pending'] })).map((o) => o.dueOn);
    must(
      await correctCompletion(h.deps, {
        completionId: done.completion.id,
        details: { completedAt: '2026-11-05T01:00:00.000Z' },
      }),
    );
    const after = (await h.repos.occurrences.list({ status: ['pending'] })).map((o) => o.dueOn);
    expect(after).toEqual(before);
  });
});
