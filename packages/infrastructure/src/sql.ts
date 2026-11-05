export type SqlValue = string | number | null;

/** The slice of a SQL database the repositories need. */
export interface SqlExecutor {
  getAll<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  execute(sql: string, params?: readonly SqlValue[]): Promise<void>;
}

/**
 * Implemented by the PowerSync adapter in the app and by node:sqlite in tests.
 * `writeTransaction` commits if the callback resolves and rolls back if it throws.
 */
export interface SqlDatabase extends SqlExecutor {
  writeTransaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
