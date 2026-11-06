import type { SqlDatabase, SqlExecutor } from './sql';

/**
 * Versioned migrations for data already on a device (spec 8.4, 9.3). See
 * docs/decisions/0001-local-schema-migrations.md for when one is needed.
 *
 * Version 1 is the baseline: every database from before migrations existed counts as
 * version 1, as does a brand-new one, so each migration must also be safe on empty tables.
 */
export interface Migration {
  /** The version the database is at once this has run. Versions are 2, 3, 4... with no gaps. */
  readonly version: number;
  readonly description: string;
  /** Runs inside one transaction together with the version bump, so it applies fully or not at all. */
  run(tx: SqlExecutor): Promise<void>;
}

/** Add new migrations at the end. Never edit or reorder one that has shipped. */
export const MIGRATIONS: readonly Migration[] = [];

export const BASELINE_VERSION = 1;

export const latestVersion = (migrations: readonly Migration[] = MIGRATIONS): number =>
  migrations.reduce((max, m) => Math.max(max, m.version), BASELINE_VERSION);

/** The data on this device was written by a newer version of the app than the one running. */
export class DatabaseTooNewError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(
      `The data on this device is from a newer version of Tend (data format ${found}; this version understands up to ${supported}). Update the app, then reopen it. Nothing has been changed.`,
    );
    this.name = 'DatabaseTooNewError';
  }
}

const VERSION_ID = 'schema_version';

async function storedVersion(x: SqlExecutor): Promise<number> {
  const rows = await x.getAll<{ value: string | null }>(
    'SELECT value FROM local_meta WHERE id = ?',
    [VERSION_ID],
  );
  const n = Number(rows[0]?.value);
  return Number.isInteger(n) && n >= BASELINE_VERSION ? n : BASELINE_VERSION;
}

async function storeVersion(x: SqlExecutor, version: number): Promise<void> {
  await x.execute('DELETE FROM local_meta WHERE id = ?', [VERSION_ID]);
  await x.execute('INSERT INTO local_meta (id, value) VALUES (?, ?)', [
    VERSION_ID,
    String(version),
  ]);
}

/** The local schema version recorded on this device; for diagnostics. */
export const readSchemaVersion = (db: SqlExecutor): Promise<number> => storedVersion(db);

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
}

/**
 * Brings the local database to the latest version, one migration per transaction so a
 * failure leaves the data at the last good version. Throws, changing nothing, if the data
 * is newer than this app. Safe to call again: it only runs what is still pending.
 */
export async function migrateLocalDatabase(
  db: SqlDatabase,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<MigrationResult> {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  ordered.forEach((m, i) => {
    if (m.version !== BASELINE_VERSION + 1 + i) {
      throw new Error(`Migrations must be numbered 2, 3, 4... without gaps; found ${m.version}.`);
    }
  });
  const latest = latestVersion(ordered);

  const from = await storedVersion(db);
  if (from > latest) throw new DatabaseTooNewError(from, latest);

  let current = from;
  for (const migration of ordered.filter((m) => m.version > from)) {
    await db.writeTransaction(async (tx) => {
      // Re-check inside the transaction: another tab may have migrated since we looked.
      if ((await storedVersion(tx)) >= migration.version) return;
      await migration.run(tx);
      await storeVersion(tx, migration.version);
    });
    current = migration.version;
  }
  return { from, to: current };
}
