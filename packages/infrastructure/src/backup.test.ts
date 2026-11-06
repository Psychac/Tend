import { completeOccurrence, createActivity, type Deps } from '@tend/application';
import type { Clock, Id, IdGenerator, Instant, Result, UserId } from '@tend/domain';
import {
  BACKUP_SCHEMA_VERSION,
  backupChecksum,
  exportBackup,
  parseBackup,
  previewRestore,
  restoreBackup,
  type BackupFile,
} from './backup';
import type { SqlDatabase } from './sql';
import { createSqlUnitOfWork } from './sql-repositories';
import { createMemoryAttachmentStorage } from './attachment-files';
import { createNodeSqliteDatabase } from './testing/node-sqlite';

const OWNER = '11111111-1111-4111-8111-111111111111' as UserId;
const NOW = '2026-11-05T06:30:00.000Z';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
};

/** A database with one scheduled activity that has been completed once. */
async function populated(idStart = 1) {
  const db = createNodeSqliteDatabase();
  let n = idStart;
  const ids: IdGenerator = {
    next<K extends string>(): Id<K> {
      n += 1;
      return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as Id<K>;
    },
  };
  const clock: Clock = { now: () => NOW as Instant };
  const deps: Deps = {
    ownerId: OWNER,
    clock,
    ids,
    uow: createSqlUnitOfWork(db),
    files: createMemoryAttachmentStorage(),
  };
  const created = must(
    await createActivity(deps, {
      name: 'Clean AC filter',
      type: 'maintenance',
      schedule: {
        strategy: { kind: 'calendar', interval: { every: 1, unit: 'week' } },
        timeZone: 'Asia/Kolkata',
        startsOn: '2026-11-05',
      },
    }),
  );
  must(await completeOccurrence(deps, { occurrenceId: created.occurrences[0]!.id, notes: 'ok' }));
  return db;
}

// Hand-edited backup JSON in tests is deliberately loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

/** Returns the backup as text after applying a hand edit to its parsed form. */
const tamper = (file: BackupFile, change: (f: Json) => void): string => {
  const copy = JSON.parse(JSON.stringify(file)) as Json;
  change(copy);
  return JSON.stringify(copy);
};

async function parsed(file: BackupFile) {
  const result = await parseBackup(JSON.stringify(file));
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.backup;
}

describe('export', () => {
  it('includes every table with counts, version and a checksum', async () => {
    const backup = await exportBackup(await populated(), NOW);
    expect(backup.format).toBe('tend-backup');
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(backup.counts.activities).toBe(1);
    expect(backup.counts.completions).toBe(1);
    expect(backup.counts.occurrences).toBeGreaterThan(1);
    expect(backup.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same data', async () => {
    const db = await populated();
    expect((await exportBackup(db, NOW)).checksum).toBe((await exportBackup(db, NOW)).checksum);
  });
});

describe('restore', () => {
  it('replace reproduces the original data exactly on an empty device', async () => {
    const backup = await exportBackup(await populated(), NOW);
    const fresh = createNodeSqliteDatabase();
    const outcome = await restoreBackup(fresh, await parsed(backup), 'replace');
    expect(outcome.ok).toBe(true);
    expect((await exportBackup(fresh, NOW)).checksum).toBe(backup.checksum);
  });

  it('replace removes data that is not in the backup', async () => {
    const backup = await exportBackup(await populated(), NOW);
    const other = await populated(100);

    const preview = await previewRestore(other, await parsed(backup), 'replace');
    expect(preview.tables.find((t) => t.table === 'activities')).toMatchObject({
      add: 1,
      remove: 1,
    });
    await restoreBackup(other, await parsed(backup), 'replace');
    expect((await exportBackup(other, NOW)).checksum).toBe(backup.checksum);
  });

  it('merge adds new rows, skips rows already present, and is idempotent', async () => {
    const backup = await parsed(await exportBackup(await populated(), NOW));
    const other = await populated(100);

    const first = await previewRestore(other, backup, 'merge');
    expect(first.tables.find((t) => t.table === 'activities')).toMatchObject({
      add: 1,
      alreadyPresent: 0,
    });
    await restoreBackup(other, backup, 'merge');
    expect((await exportBackup(other, NOW)).counts.activities).toBe(2);

    const again = await previewRestore(other, backup, 'merge');
    expect(again.tables.every((t) => t.add === 0)).toBe(true);
    await restoreBackup(other, backup, 'merge');
    expect((await exportBackup(other, NOW)).counts.activities).toBe(2);
  });

  it('merge keeps the device copy when the same id differs', async () => {
    const db = await populated();
    const backup = await parsed(await exportBackup(db, NOW));
    await db.execute("UPDATE activities SET name = 'Renamed on device'");

    await restoreBackup(db, backup, 'merge');
    const rows = await db.getAll<{ name: string }>('SELECT name FROM activities');
    expect(rows).toEqual([{ name: 'Renamed on device' }]);
  });

  it('leaves the database untouched when a restore fails part way', async () => {
    const db = await populated();
    const backup = await parsed(await exportBackup(db, NOW));
    const before = (await exportBackup(db, NOW)).checksum;

    const failing: SqlDatabase = {
      getAll: (sql, params) => db.getAll(sql, params),
      execute: (sql, params) => db.execute(sql, params),
      writeTransaction: (work) =>
        db.writeTransaction((tx) => {
          let calls = 0;
          return work({
            getAll: (sql, params) => tx.getAll(sql, params),
            execute: async (sql, params) => {
              calls += 1;
              if (calls > 12) throw new Error('disk full');
              await tx.execute(sql, params);
            },
          });
        }),
    };
    await expect(restoreBackup(failing, backup, 'replace')).rejects.toThrow('disk full');
    expect((await exportBackup(db, NOW)).checksum).toBe(before);
  });
});

describe('validation', () => {
  it('rejects text that is not JSON or not a backup', async () => {
    expect(await parseBackup('nope')).toMatchObject({ ok: false });
    expect(await parseBackup('{"a":1}')).toMatchObject({
      ok: false,
      errors: ['This file is not a Tend backup.'],
    });
  });

  it('rejects a backup from a newer app version with a clear message', async () => {
    const backup = await exportBackup(await populated(), NOW);
    const result = await parseBackup(tamper(backup, (f) => (f['schemaVersion'] = 99)));
    expect(!result.ok && result.errors[0]).toMatch(/newer version/);
  });

  it('detects edited contents through the checksum', async () => {
    const backup = await exportBackup(await populated(), NOW);
    const result = await parseBackup(
      tamper(backup, (f) => (f['tables'].activities[0].name = 'Edited by hand')),
    );
    expect(!result.ok && result.errors[0]).toMatch(/checksum/);
  });

  it('detects a truncated file', async () => {
    const text = JSON.stringify(await exportBackup(await populated(), NOW));
    expect(await parseBackup(text.slice(0, text.length / 2))).toMatchObject({ ok: false });
  });

  it('rejects rows that point at records that do not exist', async () => {
    const backup = await exportBackup(await populated(), NOW);
    const result = await parseBackup(tamper(backup, (f) => (f['tables'].activities = [])));
    expect(!result.ok && result.errors.join(' ')).toMatch(/missing activities record/);
  });

  it('rejects duplicate ids, unknown fields and wrong value types', async () => {
    const backup = await exportBackup(await populated(), NOW);
    const dup = await parseBackup(
      tamper(backup, (f) => f['tables'].activities.push(f['tables'].activities[0])),
    );
    expect(!dup.ok && dup.errors.join(' ')).toMatch(/duplicate id/);

    const extra = await parseBackup(tamper(backup, (f) => (f['tables'].activities[0].bogus = 1)));
    expect(!extra.ok && extra.errors.join(' ')).toMatch(/unknown fields bogus/);

    const wrongType = await parseBackup(
      tamper(backup, (f) => (f['tables'].activities[0].version = 'one')),
    );
    expect(!wrongType.ok && wrongType.errors.join(' ')).toMatch(/"version" is not a valid integer/);
  });
});

describe('older backups', () => {
  it('restores a format-1 backup, which has no completion_voids table', async () => {
    const db = await populated();
    const current = await exportBackup(db, NOW);
    const v1Tables = Object.fromEntries(
      Object.entries(current.tables).filter(([table]) => table !== 'completion_voids'),
    );
    const v1 = {
      format: current.format,
      schemaVersion: 1,
      exportedAt: NOW,
      checksum: await backupChecksum(v1Tables as unknown as BackupFile['tables'], 1),
      tables: v1Tables,
    };

    const result = await parseBackup(JSON.stringify(v1));
    if (!result.ok) throw new Error(result.errors.join('; '));
    expect(result.backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(result.backup.tables.completion_voids).toEqual([]);

    const fresh = createNodeSqliteDatabase();
    await restoreBackup(fresh, result.backup, 'replace');
    expect((await exportBackup(fresh, NOW)).counts.completions).toBe(1);
  });

  it('still detects tampering in an older backup', async () => {
    const db = await populated();
    const current = await exportBackup(db, NOW);
    const v1Tables = Object.fromEntries(
      Object.entries(current.tables).filter(([table]) => table !== 'completion_voids'),
    );
    const v1 = {
      format: current.format,
      schemaVersion: 1,
      exportedAt: NOW,
      checksum: await backupChecksum(v1Tables as unknown as BackupFile['tables'], 1),
      tables: v1Tables,
    };
    const edited = JSON.parse(JSON.stringify(v1)) as Json;
    edited['tables'].activities[0].name = 'Edited';
    const result = await parseBackup(JSON.stringify(edited));
    expect(!result.ok && result.errors[0]).toMatch(/checksum/);
  });
});
