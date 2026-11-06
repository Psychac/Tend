import { PowerSyncDatabase, Schema, Table, column } from '@powersync/web';
import { LOCAL_ONLY_TABLES, TABLES, type ColumnType, type TableDef } from './schema';
import { migrateLocalDatabase } from './migrations';
import type { SqlDatabase, SqlExecutor, SqlValue } from './sql';

const COLUMN_TYPES = {
  text: column.text,
  integer: column.integer,
  real: column.real,
} as const satisfies Record<ColumnType, unknown>;

/** Builds the PowerSync client schema from the shared table definitions. */
export function buildPowerSyncSchema(): Schema {
  const tables: Record<string, Table> = {};
  for (const [name, def] of Object.entries(TABLES as Record<string, TableDef>)) {
    const columns = Object.fromEntries(
      Object.entries(def.columns).map(([col, type]) => [col, COLUMN_TYPES[type]]),
    );
    const indexes = def.indexes
      ? Object.fromEntries(Object.entries(def.indexes).map(([n, cols]) => [n, [...cols]]))
      : undefined;
    tables[name] = new Table(columns, indexes ? { indexes } : undefined);
  }
  for (const [name, def] of Object.entries(LOCAL_ONLY_TABLES as Record<string, TableDef>)) {
    const columns = Object.fromEntries(
      Object.entries(def.columns).map(([col, type]) => [col, COLUMN_TYPES[type]]),
    );
    tables[name] = new Table(columns, { localOnly: true });
  }
  return new Schema(tables);
}

/** Adapts a PowerSync database to the SqlDatabase port. */
export class PowerSyncSqlDatabase implements SqlDatabase {
  constructor(readonly powersync: PowerSyncDatabase) {}

  getAll<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    return this.powersync.getAll<T>(sql, [...params]);
  }

  async execute(sql: string, params: readonly SqlValue[] = []): Promise<void> {
    await this.powersync.execute(sql, [...params]);
  }

  writeTransaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.powersync.writeTransaction((tx) =>
      work({
        getAll: <R>(sql: string, params: readonly SqlValue[] = []) =>
          tx.getAll<R>(sql, [...params]),
        execute: async (sql: string, params: readonly SqlValue[] = []) => {
          await tx.execute(sql, [...params]);
        },
      }),
    );
  }
}

export interface LocalDatabaseOptions {
  /** Database file name inside the browser's storage. Only open one instance per file. */
  readonly dbFilename?: string;
  /** Runs the local schema migrations. Defaults to `migrateLocalDatabase`; the app can wrap it, for example in a cross-tab lock. */
  readonly migrate?: (db: SqlDatabase) => Promise<unknown>;
}

/**
 * Opens the on-device database. This is local-only: the database is created
 * and used normally but is never connected to a sync backend (spec 3.5,
 * Phase 1). Enabling sync later means calling `powersync.connect(...)`.
 */
export async function openLocalDatabase(
  options: LocalDatabaseOptions = {},
): Promise<PowerSyncSqlDatabase> {
  const powersync = new PowerSyncDatabase({
    schema: buildPowerSyncSchema(),
    database: { dbFilename: options.dbFilename ?? 'tend.db' },
  });
  await powersync.init();
  const db = new PowerSyncSqlDatabase(powersync);
  // Bring data written by an older version of the app up to date before anything reads it.
  await (options.migrate ?? migrateLocalDatabase)(db);
  return db;
}
