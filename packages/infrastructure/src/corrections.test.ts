import {
  completeOccurrence,
  correctCompletion,
  createActivity,
  getHistory,
  undoCompletion,
  type Deps,
} from '@upkeep/application';
import type { Clock, Id, IdGenerator, Instant, Result, TimeZoneId, UserId } from '@upkeep/domain';
import { exportBackup, parseBackup, restoreBackup } from './backup';
import { createSqlRepositories, createSqlUnitOfWork } from './sql-repositories';
import { createNodeSqliteDatabase } from './testing/node-sqlite';

const OWNER = '11111111-1111-4111-8111-111111111111' as UserId;
const NOW = '2026-11-05T06:30:00.000Z';

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
  const clock: Clock = { now: () => NOW as Instant };
  const deps: Deps = { ownerId: OWNER, clock, ids, uow: createSqlUnitOfWork(db) };
  return { db, deps, repos: createSqlRepositories(db) };
}

const daily = {
  strategy: { kind: 'calendar', interval: { every: 1, unit: 'day' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05',
} as const;

describe('corrections over SQL', () => {
  it('hides undone and replaced completions and their readings, keeping the originals', async () => {
    const { deps, repos } = setup();
    const a = must(
      await createActivity(deps, { name: 'Service', type: 'maintenance', schedule: daily }),
    );
    const first = must(
      await completeOccurrence(deps, {
        occurrenceId: a.occurrences[0]!.id,
        notes: 'wrong',
        measurements: [{ kind: 'numeric', key: 'odometer', value: 1, unit: 'km' }],
      }),
    );
    const fixed = must(
      await correctCompletion(deps, {
        completionId: first.completion.id,
        details: {
          notes: 'right',
          measurements: [{ kind: 'numeric', key: 'odometer', value: 2, unit: 'km' }],
        },
      }),
    );

    expect((await repos.completions.list({})).map((c) => c.notes)).toEqual(['right']);
    expect(await repos.completions.list({ includeVoided: true })).toHaveLength(2);
    expect((await repos.measurements.list({})).map((m) => m.completionId)).toEqual([
      fixed.completion.id,
    ]);
    expect((await repos.completionVoids.getByCompletion(first.completion.id))?.replacedBy).toBe(
      fixed.completion.id,
    );

    const page = await getHistory(repos, { timeZone: 'Asia/Kolkata' as TimeZoneId });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]?.kind === 'completed' && page.entries[0].edited).toBe(true);

    const undone = must(await undoCompletion(deps, { completionId: fixed.completion.id }));
    expect(undone.reopened?.status).toBe('pending');
    expect((await getHistory(repos, { timeZone: 'Asia/Kolkata' as TimeZoneId })).entries).toEqual(
      [],
    );
  });

  it('survives a backup and restore, so undone work stays undone', async () => {
    const { db, deps } = setup();
    const a = must(await createActivity(deps, { name: 'Chore', type: 'routine', schedule: daily }));
    const done = must(await completeOccurrence(deps, { occurrenceId: a.occurrences[0]!.id }));
    must(await undoCompletion(deps, { completionId: done.completion.id }));

    const backup = await exportBackup(db, NOW);
    expect(backup.counts.completion_voids).toBe(1);
    const parsed = await parseBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));

    const fresh = createNodeSqliteDatabase();
    await restoreBackup(fresh, parsed.backup, 'replace');
    const restored = createSqlRepositories(fresh);
    expect(await restored.completions.list({})).toEqual([]);
    expect(await restored.completions.list({ includeVoided: true })).toHaveLength(1);
    expect(
      (await getHistory(restored, { timeZone: 'Asia/Kolkata' as TimeZoneId })).entries,
    ).toEqual([]);
  });

  it('rejects a backup whose void points at a missing completion', async () => {
    const { db, deps } = setup();
    const a = must(await createActivity(deps, { name: 'Chore', type: 'routine', schedule: daily }));
    const done = must(await completeOccurrence(deps, { occurrenceId: a.occurrences[0]!.id }));
    must(await undoCompletion(deps, { completionId: done.completion.id }));
    const backup = await exportBackup(db, NOW);
    const broken = JSON.parse(JSON.stringify(backup)) as {
      tables: Record<string, unknown[]>;
    };
    broken.tables['completions'] = [];
    const result = await parseBackup(JSON.stringify(broken));
    expect(!result.ok && result.errors.join(' ')).toMatch(/missing completions record/);
  });
});
