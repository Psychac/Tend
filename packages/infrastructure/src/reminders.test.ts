import {
  createActivity,
  deliverDueReminders,
  getReminderStatus,
  setActivityReminder,
  type Deps,
} from '@tend/application';
import type { Clock, Id, IdGenerator, Instant, Result, TimeZoneId, UserId } from '@tend/domain';
import {
  BACKUP_SCHEMA_VERSION,
  backupChecksum,
  exportBackup,
  parseBackup,
  restoreBackup,
  type BackupFile,
} from './backup';
import { createSqlRepositories, createSqlUnitOfWork } from './sql-repositories';
import { createMemoryAttachmentStorage } from './attachment-files';
import { createNodeSqliteDatabase } from './testing/node-sqlite';

const OWNER = '11111111-1111-4111-8111-111111111111' as UserId;
const KOLKATA = 'Asia/Kolkata' as TimeZoneId;
const NOW = '2026-11-05T04:00:00.000Z' as Instant; // after 09:00 in Kolkata

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
  const clock: Clock = { now: () => NOW };
  const deps: Deps = {
    ownerId: OWNER,
    clock,
    ids,
    uow: createSqlUnitOfWork(db),
    files: createMemoryAttachmentStorage(),
  };
  return { db, deps, repos: createSqlRepositories(db) };
}

const weekly = {
  strategy: { kind: 'calendar', interval: { every: 1, unit: 'week' } },
  timeZone: 'Asia/Kolkata',
  startsOn: '2026-11-05',
} as const;

async function withReminder() {
  const s = setup();
  const a = must(
    await createActivity(s.deps, { name: 'Clean AC', type: 'maintenance', schedule: weekly }),
  );
  must(
    await setActivityReminder(s.deps, {
      activityId: a.activity.id,
      leadDays: 0,
      atTime: '09:00',
      enabled: true,
    }),
  );
  return s;
}

describe('reminders over SQL', () => {
  it('stores the reminder and delivers once, remembering across a fresh connection', async () => {
    const { deps, repos } = await withReminder();
    const [stored] = await repos.reminders.list();
    expect(stored).toMatchObject({ leadDays: 0, atTime: '09:00', enabled: true });

    const shown: number[] = [];
    const deliver = async (b: { items: readonly unknown[] }) => {
      shown.push(b.items.length);
      return true;
    };
    const first = must(await deliverDueReminders(deps, { now: NOW, timeZone: KOLKATA, deliver }));
    expect(first.delivered).toBe(1);
    expect((await repos.reminderDeliveries.list())[0]).toMatchObject({ dueOn: '2026-11-05' });

    const again = must(await deliverDueReminders(deps, { now: NOW, timeZone: KOLKATA, deliver }));
    expect(again.delivered).toBe(0);
    expect(shown).toEqual([1]);
    expect((await getReminderStatus(repos, { now: NOW, timeZone: KOLKATA })).fired).toHaveLength(1);
  });

  it('backs up and restores reminders and what was delivered', async () => {
    const { db, deps } = await withReminder();
    await deliverDueReminders(deps, { now: NOW, timeZone: KOLKATA, deliver: async () => true });

    const backup = await exportBackup(db, NOW);
    expect(backup.counts.reminders).toBe(1);
    expect(backup.counts.reminder_deliveries).toBe(1);
    const parsed = await parseBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));

    const fresh = createNodeSqliteDatabase();
    await restoreBackup(fresh, parsed.backup, 'replace');
    const restored = createSqlRepositories(fresh);
    expect(await restored.reminders.list()).toHaveLength(1);
    // Already delivered stays delivered: restoring must not make old reminders fire again.
    expect((await restored.reminderDeliveries.keys()).size).toBe(1);
  });

  it('still restores a format-2 backup, which has no reminder tables', async () => {
    const { db } = await withReminder();
    const current = await exportBackup(db, NOW);
    const v2Tables = Object.fromEntries(
      Object.entries(current.tables).filter(
        ([table]) => table !== 'reminders' && table !== 'reminder_deliveries',
      ),
    ) as unknown as BackupFile['tables'];
    const v2 = {
      format: current.format,
      schemaVersion: 2,
      exportedAt: NOW,
      checksum: await backupChecksum(v2Tables, 2),
      tables: v2Tables,
    };
    const result = await parseBackup(JSON.stringify(v2));
    if (!result.ok) throw new Error(result.errors.join('; '));
    expect(result.backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(result.backup.tables.reminders).toEqual([]);
    expect(result.backup.tables.reminder_deliveries).toEqual([]);
  });

  it('rejects a backup whose reminder points at a missing activity', async () => {
    const { db } = await withReminder();
    const backup = await exportBackup(db, NOW);
    const broken = JSON.parse(JSON.stringify(backup)) as { tables: Record<string, unknown[]> };
    broken.tables['activities'] = [];
    broken.tables['schedules'] = [];
    broken.tables['occurrences'] = [];
    const result = await parseBackup(JSON.stringify(broken));
    expect(!result.ok && result.errors.join(' ')).toMatch(/missing activities record/);
  });
});
