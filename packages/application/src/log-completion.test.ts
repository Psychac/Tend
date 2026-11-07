import type { Result, TimeZoneId } from '@tend/domain';
import {
  archiveActivity,
  completeOccurrence,
  createActivity,
  getHistory,
  getInsights,
  logCompletion,
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
  startsOn: '2026-11-05',
} as const;
const afterCompletion = {
  strategy: { kind: 'completion_interval', interval: { every: 30, unit: 'day' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05',
} as const;

describe('logCompletion', () => {
  it('records a one-off with no schedule and shows it in History and Insights', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'Water plants', type: 'routine' }));
    expect(a.occurrences).toHaveLength(0);

    const r = must(await logCompletion(h.deps, { activityId: a.activity.id, notes: 'front yard' }));
    expect(r.completion.occurrenceId).toBeUndefined();
    expect(r.completion.plannedFor).toBeUndefined();

    const history = await getHistory(h.repos, { timeZone: KOLKATA });
    expect(history.entries.map((e) => e.kind)).toEqual(['completed']);
    const insights = await getInsights(h.repos, {
      today: '2026-11-05' as never,
      timeZone: KOLKATA,
    });
    expect(insights.completed).toBe(1);
    // Nothing was planned for it, so it does not count towards "done on time".
    expect(insights.onTimeRate).toBeUndefined();
  });

  it('can be backdated, but not dated in the future', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'Service', type: 'maintenance' }));
    const past = must(
      await logCompletion(h.deps, {
        activityId: a.activity.id,
        completedAt: '2026-10-01T06:00:00.000Z',
      }),
    );
    expect(past.completion.completedAt).toBe('2026-10-01T06:00:00.000Z');

    const future = await logCompletion(h.deps, {
      activityId: a.activity.id,
      completedAt: '2026-12-01T06:00:00.000Z',
    });
    expect(future.ok).toBe(false);
  });

  it('refuses an archived activity', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'Old', type: 'routine' }));
    must(await archiveActivity(h.deps, { activityId: a.activity.id }));
    expect((await logCompletion(h.deps, { activityId: a.activity.id })).ok).toBe(false);
  });

  it('leaves a calendar schedule and its open occurrences alone', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Chore', type: 'routine', schedule: weekly }),
    );
    const before = await h.repos.occurrences.list({ activityId: a.activity.id });
    must(await logCompletion(h.deps, { activityId: a.activity.id }));
    const after = await h.repos.occurrences.list({ activityId: a.activity.id });
    expect(after.map((o) => [o.id, o.status])).toEqual(before.map((o) => [o.id, o.status]));
  });

  it('restarts an after-completion schedule from the logged date', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Filter',
        type: 'maintenance',
        schedule: afterCompletion,
      }),
    );
    expect(a.occurrences.map((o) => o.dueOn)).toEqual(['2026-11-05']);

    // Done early, on 2 Nov: the open occurrence is replaced by one 30 days after it.
    const r = must(
      await logCompletion(h.deps, {
        activityId: a.activity.id,
        completedAt: '2026-11-02T06:00:00.000Z',
      }),
    );
    expect(r.nextOccurrences.map((o) => o.dueOn)).toEqual(['2026-12-02']);
    const open = await h.repos.occurrences.list({
      activityId: a.activity.id,
      status: ['pending', 'snoozed'],
    });
    expect(open.map((o) => o.dueOn)).toEqual(['2026-12-02']);
  });

  it('does not restart the schedule when the entry is older than the latest completion', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Filter',
        type: 'maintenance',
        schedule: afterCompletion,
      }),
    );
    must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[0]!.id,
        completedAt: '2026-11-04T06:00:00.000Z',
      }),
    );
    const before = await h.repos.occurrences.list({
      activityId: a.activity.id,
      status: ['pending'],
    });
    must(
      await logCompletion(h.deps, {
        activityId: a.activity.id,
        completedAt: '2026-10-01T06:00:00.000Z',
      }),
    );
    const after = await h.repos.occurrences.list({
      activityId: a.activity.id,
      status: ['pending'],
    });
    expect(after.map((o) => o.id)).toEqual(before.map((o) => o.id));
  });

  it('triggers an activity that follows this one', async () => {
    const h = createHarness();
    const first = must(await createActivity(h.deps, { name: 'Brew', type: 'routine' }));
    const second = must(
      await createActivity(h.deps, {
        name: 'Bottle',
        type: 'routine',
        schedule: {
          strategy: { kind: 'event', afterActivityId: first.activity.id, delayDays: 7 },
          timeZone: 'Asia/Kolkata',
          startsOn: '2026-11-05',
        },
      }),
    );
    expect(second.occurrences).toHaveLength(0);
    const r = must(await logCompletion(h.deps, { activityId: first.activity.id }));
    expect(r.nextOccurrences.map((o) => o.dueOn)).toEqual(['2026-11-12']);
  });
});
