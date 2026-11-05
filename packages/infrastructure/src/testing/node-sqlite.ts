import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { schemaDdl } from '../schema';
import type { SqlDatabase, SqlExecutor, SqlValue } from '../sql';

/**
 * A SqlDatabase over Node's built-in SQLite, creating the same schema the app
 * uses. Lets the SQL repositories be tested without a browser.
 */
export function createNodeSqliteDatabase(): SqlDatabase {
  const db = new DatabaseSync(':memory:');
  for (const statement of schemaDdl()) db.exec(statement);

  const executor: SqlExecutor = {
    async getAll<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).all(...(params as SQLInputValue[])) as T[];
    },
    async execute(sql: string, params: readonly SqlValue[] = []) {
      db.prepare(sql).run(...(params as SQLInputValue[]));
    },
  };

  return {
    ...executor,
    async writeTransaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      db.exec('BEGIN');
      try {
        const result = await work(executor);
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
