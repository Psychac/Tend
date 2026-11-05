import {
  archiveActivity,
  createActivity,
  setActivitySchedule,
  unarchiveActivity,
  updateActivity,
  type Deps,
} from '@upkeep/application';
import type { Clock, Id, IdGenerator, Instant, Result, UserId } from '@upkeep/domain';
import { createSqlRepositories, createSqlUnitOfWork } from './sql-repositories';
import { createNodeSqliteDatabase } from './testing/node-sqlite';

const OWNER = '11111111-1111-4111-8111-111111111111' as UserId;

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

function setup() {
  const db = createNodeSqliteDatabase();
  let n = 0;
  const ids: IdGenerator = {
    next<K extends string>(): Id<K> {
      n += 1;
      return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as Id<K>;
    },
  };
  const clock: Clock = { now: () => '2026-11-05T06:30:00.000Z' as Instant };
  const deps: Deps = { ownerId: OWNER, clock, ids, uow: createSqlUnitOfWork(db) };
  return { deps, repos: createSqlRepositories(db) };
}

const weekly = {
  strategy: { kind: 'calendar', interval: { every: 1, unit: 'week' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05',
} as const;

describe('editing over SQL', () => {
  it('persists edited details, checklist ids and requirements', async () => {
    const { deps, repos } = setup();
    const a = must(
      await createActivity(deps, { name: 'Servce car', type: 'maintenance', checklist: ['Oil'] }),
    );
    const kept = a.activity.checklist[0]!;
    must(
      await updateActivity(deps, {
        activityId: a.activity.id,
        name: 'Service car',
        type: 'maintenance',
        checklist: [{ id: kept.id, label: 'Oil' }, { label: 'Tyres' }],
        measurementRequirements: [{ key: 'odometer', unit: 'km', required: true }],
      }),
    );
    const stored = (await repos.activities.getById(a.activity.id))!;
    expect(stored.name).toBe('Service car');
    expect(stored.meta.version).toBe(2);
    expect(stored.checklist.map((c) => c.label)).toEqual(['Oil', 'Tyres']);
    expect(stored.checklist[0]?.id).toBe(kept.id);
    expect(stored.measurementRequirements).toEqual([
      { key: 'odometer', unit: 'km', required: true },
    ]);
  });

  it('changes a schedule, then archives and restores the activity', async () => {
    const { deps, repos } = setup();
    const a = must(
      await createActivity(deps, { name: 'Chore', type: 'routine', schedule: weekly }),
    );
    must(
      await setActivitySchedule(deps, {
        activityId: a.activity.id,
        schedule: {
          ...weekly,
          strategy: { kind: 'calendar', interval: { every: 1, unit: 'month' } },
        },
      }),
    );
    const open = await repos.occurrences.list({ status: ['pending'] });
    expect(open.map((o) => o.dueOn)).toEqual(['2026-11-05', '2026-12-05']); // weekly extras were superseded

    must(await archiveActivity(deps, { activityId: a.activity.id }));
    must(await unarchiveActivity(deps, { activityId: a.activity.id }));
    const again = await repos.occurrences.list({ status: ['pending'] });
    expect(again.map((o) => o.dueOn)).toEqual(['2026-11-05', '2026-12-05']);
  });
});
