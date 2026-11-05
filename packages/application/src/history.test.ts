import type { Result, TimeZoneId } from '@tend/domain';
import {
  archiveActivity,
  completeOccurrence,
  createActivity,
  getHistory,
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

describe('getHistory', () => {
  it('lists completions and skips newest first with cost, checklist and measurements', async () => {
    const h = createHarness(); // 2026-11-05 noon Kolkata
    const a = must(
      await createActivity(h.deps, {
        name: 'Service car',
        type: 'maintenance',
        checklist: ['Oil', 'Tyres'],
        measurementRequirements: [{ key: 'odometer', unit: 'km', required: false }],
        schedule: daily,
      }),
    );
    const checklist = a.activity.checklist;
    must(
      await completeOccurrence(h.deps, {
        occurrenceId: a.occurrences[0]!.id,
        notes: 'All fine',
        cost: { minor: 2500, currency: 'USD' },
        checklistResults: [
          { itemId: checklist[0]!.id, done: true },
          { itemId: checklist[1]!.id, done: false },
        ],
        measurements: [{ kind: 'numeric', key: 'odometer', value: 12000, unit: 'km' }],
      }),
    );
    h.clock.set('2026-11-06T06:30:00.000Z');
    must(await skipOccurrence(h.deps, { occurrenceId: a.occurrences[1]!.id }));

    const page = await getHistory(h.repos, { timeZone: KOLKATA });
    expect(page.entries.map((e) => e.kind)).toEqual(['skipped', 'completed']);
    expect(page.hasMore).toBe(false);

    const done = page.entries[1]!;
    if (done.kind !== 'completed') throw new Error('expected a completion');
    expect(done.activityName).toBe('Service car');
    expect(done.completion.cost).toEqual({ minor: 2500, currency: 'USD' });
    expect(done.checklistDone).toBe(1);
    expect(done.checklistTotal).toBe(2);
    expect(done.daysFromPlanned).toBe(0);
    expect(done.measurements).toHaveLength(1);
  });

  it('reports lateness against the planned date', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Water plants', type: 'routine', schedule: daily }),
    );
    h.clock.set('2026-11-08T06:30:00.000Z');
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));

    const [entry] = (await getHistory(h.repos, { timeZone: KOLKATA })).entries;
    expect(entry?.kind === 'completed' && entry.daysFromPlanned).toBe(3);
  });

  it('filters by activity and by kind', async () => {
    const h = createHarness();
    const a = must(await createActivity(h.deps, { name: 'A', type: 'routine', schedule: daily }));
    const b = must(await createActivity(h.deps, { name: 'B', type: 'routine', schedule: daily }));
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    must(await skipOccurrence(h.deps, { occurrenceId: b.occurrences[0]!.id }));

    expect(
      (await getHistory(h.repos, { timeZone: KOLKATA, activityId: a.activity.id })).entries,
    ).toHaveLength(1);
    const skippedOnly = await getHistory(h.repos, { timeZone: KOLKATA, kind: 'skipped' });
    expect(skippedOnly.entries.map((e) => e.activityName)).toEqual(['B']);
  });

  it('pages through long histories', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Daily', type: 'routine', schedule: daily }),
    );
    for (const o of a.occurrences.slice(0, 5)) {
      h.clock.set(new Date(Date.parse(h.clock.now()) + 3_600_000).toISOString());
      must(await completeOccurrence(h.deps, { occurrenceId: o.id }));
    }
    const first = await getHistory(h.repos, { timeZone: KOLKATA, limit: 2 });
    expect(first.entries).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const last = await getHistory(h.repos, { timeZone: KOLKATA, limit: 2, offset: 4 });
    expect(last.entries).toHaveLength(1);
    expect(last.hasMore).toBe(false);
  });

  it('still shows history for an archived activity', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, { name: 'Old chore', type: 'routine', schedule: daily }),
    );
    must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    must(await archiveActivity(h.deps, { activityId: a.activity.id }));
    const page = await getHistory(h.repos, { timeZone: KOLKATA });
    expect(page.entries[0]?.activityName).toBe('Old chore');
  });
});
