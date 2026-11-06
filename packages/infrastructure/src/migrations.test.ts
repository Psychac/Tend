import { exportBackup } from './backup';
import { createNodeSqliteDatabase } from './testing/node-sqlite';
import {
  DatabaseTooNewError,
  migrateLocalDatabase,
  MIGRATIONS,
  type Migration,
} from './migrations';
import type { SqlDatabase } from './sql';

const OWNER = '00000000-0000-4000-8000-000000000001';

/** A database as an older version of the app left it: data present, no version recorded. */
async function seededV1(): Promise<SqlDatabase> {
  const db = createNodeSqliteDatabase();
  const now = '2026-01-01T00:00:00.000Z';
  await db.execute(
    `INSERT INTO categories (id, owner_id, created_at, updated_at, version, name) VALUES (?, ?, ?, ?, 1, ?)`,
    ['c1', OWNER, now, now, 'Home'],
  );
  await db.execute(
    `INSERT INTO activities (id, owner_id, created_at, updated_at, version, name, type, priority, category_id)
     VALUES (?, ?, ?, ?, 1, ?, 'routine', 'medium', 'c1')`,
    ['a1', OWNER, now, now, 'Water plants'],
  );
  return db;
}

const versionOf = async (db: SqlDatabase) =>
  (
    await db.getAll<{ value: string }>("SELECT value FROM local_meta WHERE id = 'schema_version'")
  )[0]?.value;

const addPriorityNote: Migration = {
  version: 2,
  description: 'Backfill: tag existing activities',
  run: async (tx) => {
    await tx.execute("UPDATE activities SET description = 'migrated' WHERE description IS NULL");
  },
};

describe('local schema migrations', () => {
  it('ships with no pending migrations and leaves an existing database alone', async () => {
    const db = await seededV1();
    expect(await migrateLocalDatabase(db)).toEqual({ from: 1, to: 1 });
    expect(MIGRATIONS).toEqual([]);
    expect(await db.getAll('SELECT id FROM activities')).toHaveLength(1);
  });

  it('upgrades a v1 database to v2 with its data intact', async () => {
    const db = await seededV1();
    expect(await migrateLocalDatabase(db, [addPriorityNote])).toEqual({ from: 1, to: 2 });
    expect(await versionOf(db)).toBe('2');
    const [a] = await db.getAll<{ name: string; description: string; category_id: string }>(
      'SELECT name, description, category_id FROM activities',
    );
    expect(a).toEqual({ name: 'Water plants', description: 'migrated', category_id: 'c1' });
    expect(await db.getAll('SELECT id FROM categories')).toHaveLength(1);
  });

  it('is safe to run again and on an empty database', async () => {
    const db = createNodeSqliteDatabase();
    expect(await migrateLocalDatabase(db, [addPriorityNote])).toEqual({ from: 1, to: 2 });
    expect(await migrateLocalDatabase(db, [addPriorityNote])).toEqual({ from: 2, to: 2 });
  });

  it('runs several migrations in order', async () => {
    const db = await seededV1();
    const order: number[] = [];
    const m = (version: number): Migration => ({
      version,
      description: `v${version}`,
      run: async () => void order.push(version),
    });
    expect(await migrateLocalDatabase(db, [m(3), m(2), m(4)])).toEqual({ from: 1, to: 4 });
    expect(order).toEqual([2, 3, 4]);
  });

  it('rolls a failed migration back and keeps the last good version', async () => {
    const db = await seededV1();
    const broken: Migration = {
      version: 3,
      description: 'fails halfway',
      run: async (tx) => {
        await tx.execute("UPDATE activities SET name = 'half done'");
        throw new Error('boom');
      },
    };
    await expect(migrateLocalDatabase(db, [addPriorityNote, broken])).rejects.toThrow('boom');
    expect(await versionOf(db)).toBe('2');
    const [a] = await db.getAll<{ name: string }>('SELECT name FROM activities');
    expect(a?.name).toBe('Water plants');
  });

  it('refuses data from a newer app and changes nothing', async () => {
    const db = await seededV1();
    await db.execute("INSERT INTO local_meta (id, value) VALUES ('schema_version', '9')");
    await expect(migrateLocalDatabase(db, [addPriorityNote])).rejects.toBeInstanceOf(
      DatabaseTooNewError,
    );
    expect(await versionOf(db)).toBe('9');
    expect(await db.getAll('SELECT id FROM activities')).toHaveLength(1);
  });

  it('rejects a migration list with gaps', async () => {
    await expect(
      migrateLocalDatabase(createNodeSqliteDatabase(), [{ ...addPriorityNote, version: 3 }]),
    ).rejects.toThrow(/without gaps/);
  });

  it('keeps the version row out of backups', async () => {
    const db = await seededV1();
    await migrateLocalDatabase(db, [addPriorityNote]);
    const backup = await exportBackup(db, '2026-02-01T00:00:00.000Z' as never);
    expect(Object.keys(backup.tables)).not.toContain('local_meta');
    expect(backup.counts.activities).toBe(1);
  });
});
