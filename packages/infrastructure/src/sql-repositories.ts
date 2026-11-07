import { ConflictError, type Page, type Repositories, type UnitOfWork } from '@tend/contracts';
import { deliveryKey, type EntityMeta } from '@tend/domain';
import {
  activityMapper,
  assetMapper,
  auditMapper,
  categoryMapper,
  completionMapper,
  completionVoidMapper,
  locationMapper,
  attachmentMapper,
  measurementMapper,
  reminderDeliveryMapper,
  reminderMapper,
  occurrenceMapper,
  scheduleMapper,
  type Mapper,
  type Row,
} from './mappers';
import { TABLES, type TableName } from './schema';
import type { SqlDatabase, SqlExecutor, SqlValue } from './sql';

/** Where reads and writes run: either the database, or one open transaction. */
interface Runner {
  read: SqlExecutor;
  write<T>(work: (x: SqlExecutor) => Promise<T>): Promise<T>;
}

interface Query {
  readonly where: string[];
  readonly params: SqlValue[];
  readonly orderBy: string;
  readonly page: Page;
}

/** Appends one WHERE clause and its bound values. */
const add = (where: string[], params: SqlValue[], clause: string, ...values: SqlValue[]): void => {
  where.push(clause);
  params.push(...values);
};

const placeholders = (n: number): string => new Array(n).fill('?').join(', ');

/** Escapes LIKE wildcards so user search text is matched literally. */
const likeContains = (text: string): string => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

class SqlTable<E extends { id: string; meta: EntityMeta }> {
  private readonly columns: string[];

  constructor(
    private readonly runner: Runner,
    private readonly table: TableName,
    private readonly mapper: Mapper<E>,
  ) {
    this.columns = Object.keys(TABLES[table].columns);
  }

  async getById(id: string): Promise<E | null> {
    const rows = await this.runner.read.getAll<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [
      id,
    ]);
    return rows[0] ? this.mapper.fromRow(rows[0]) : null;
  }

  async query(q: Partial<Query> & { orderBy: string }): Promise<E[]> {
    const params = [...(q.params ?? [])];
    const where = q.where ?? [];
    const page = q.page ?? {};
    let sql = `SELECT * FROM ${this.table}`;
    if (where.length > 0) sql += ` WHERE ${where.join(' AND ')}`;
    sql += ` ORDER BY ${q.orderBy}`;
    if (page.limit !== undefined) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(page.limit, page.offset ?? 0);
    } else if (page.offset) {
      sql += ' LIMIT -1 OFFSET ?';
      params.push(page.offset);
    }
    const rows = await this.runner.read.getAll<Row>(sql, params);
    return rows.map((r) => this.mapper.fromRow(r));
  }

  /** Insert, or update when the version is exactly one ahead; otherwise a stale-write conflict. */
  save(entity: E): Promise<void> {
    return this.runner.write(async (x) => {
      const existing = await x.getAll<{ version: number }>(
        `SELECT version FROM ${this.table} WHERE id = ?`,
        [entity.id],
      );
      const values = this.mapper.toRow(entity);
      const current = existing[0];
      if (current) {
        if (entity.meta.version !== Number(current.version) + 1) {
          throw new ConflictError(
            `${this.table} ${entity.id} is at version ${current.version}; cannot save version ${entity.meta.version}`,
          );
        }
        const sets = this.columns.map((c) => `${c} = ?`).join(', ');
        await x.execute(`UPDATE ${this.table} SET ${sets} WHERE id = ?`, [
          ...this.columns.map((c) => values[c] ?? null),
          entity.id,
        ]);
      } else {
        await this.insert(x, entity.id, values);
      }
    });
  }

  /** Append-only: an id that already exists is left untouched (idempotent retries). */
  append(entity: E): Promise<void> {
    return this.runner.write(async (x) => {
      const existing = await x.getAll(`SELECT id FROM ${this.table} WHERE id = ?`, [entity.id]);
      if (existing.length === 0) await this.insert(x, entity.id, this.mapper.toRow(entity));
    });
  }

  remove(id: string): Promise<void> {
    return this.runner.write((x) => x.execute(`DELETE FROM ${this.table} WHERE id = ?`, [id]));
  }

  private insert(x: SqlExecutor, id: string, values: Record<string, SqlValue>): Promise<void> {
    return x.execute(
      `INSERT INTO ${this.table} (id, ${this.columns.join(', ')}) VALUES (${placeholders(this.columns.length + 1)})`,
      [id, ...this.columns.map((c) => values[c] ?? null)],
    );
  }
}

const NOT_VOIDED = 'id NOT IN (SELECT completion_id FROM completion_voids)';

function buildRepositories(runner: Runner): Repositories {
  const activities = new SqlTable(runner, 'activities', activityMapper);
  const assets = new SqlTable(runner, 'assets', assetMapper);
  const categories = new SqlTable(runner, 'categories', categoryMapper);
  const locations = new SqlTable(runner, 'locations', locationMapper);
  const attachments = new SqlTable(runner, 'attachments', attachmentMapper);
  const schedules = new SqlTable(runner, 'schedules', scheduleMapper);
  const occurrences = new SqlTable(runner, 'occurrences', occurrenceMapper);
  const completions = new SqlTable(runner, 'completions', completionMapper);
  const completionVoids = new SqlTable(runner, 'completion_voids', completionVoidMapper);
  const reminders = new SqlTable(runner, 'reminders', reminderMapper);
  const reminderDeliveries = new SqlTable(runner, 'reminder_deliveries', reminderDeliveryMapper);
  const measurements = new SqlTable(runner, 'measurements', measurementMapper);
  const audit = new SqlTable(runner, 'audit_events', auditMapper);

  return {
    activities: {
      getById: (id) => activities.getById(id),
      list: (f) => {
        const where: string[] = [];
        const params: SqlValue[] = [];
        if (!f.includeArchived) where.push('archived_at IS NULL');
        if (f.type !== undefined) add(where, params, 'type = ?', f.type);
        if (f.categoryId !== undefined) add(where, params, 'category_id = ?', f.categoryId);
        if (f.locationId !== undefined) add(where, params, 'location_id = ?', f.locationId);
        if (f.assetId !== undefined) add(where, params, 'asset_id = ?', f.assetId);
        if (f.search !== undefined) {
          where.push("name LIKE ? ESCAPE '\\'");
          params.push(likeContains(f.search));
        }
        return activities.query({ where, params, orderBy: 'name COLLATE NOCASE', page: f });
      },
      save: (a) => activities.save(a),
      delete: (id) => activities.remove(id),
    },
    assets: {
      getById: (id) => assets.getById(id),
      list: (f) => {
        const where: string[] = [];
        const params: SqlValue[] = [];
        if (f.status !== undefined) add(where, params, 'status = ?', f.status);
        if (f.categoryId !== undefined) add(where, params, 'category_id = ?', f.categoryId);
        if (f.locationId !== undefined) add(where, params, 'location_id = ?', f.locationId);
        if (f.search !== undefined) {
          where.push("name LIKE ? ESCAPE '\\'");
          params.push(likeContains(f.search));
        }
        return assets.query({ where, params, orderBy: 'name COLLATE NOCASE', page: f });
      },
      save: (a) => assets.save(a),
      delete: (id) => assets.remove(id),
    },
    categories: {
      getById: (id) => categories.getById(id),
      list: () => categories.query({ orderBy: 'name COLLATE NOCASE' }),
      save: (c) => categories.save(c),
      delete: (id) => categories.remove(id),
    },
    attachments: {
      getById: (id) => attachments.getById(id),
      listBySubject: (s) =>
        attachments.query({
          where: ['subject_type = ?', 'subject_id = ?'],
          params: [s.type, s.id],
          orderBy: 'created_at ASC, id ASC',
        }),
      list: () => attachments.query({ orderBy: 'created_at ASC, id ASC' }),
      save: (a) => attachments.save(a),
      delete: (id) => attachments.remove(id),
    },
    locations: {
      getById: (id) => locations.getById(id),
      list: () => locations.query({ orderBy: 'name COLLATE NOCASE' }),
      save: (l) => locations.save(l),
      delete: (id) => locations.remove(id),
    },
    schedules: {
      getById: (id) => schedules.getById(id),
      list: () => schedules.query({ orderBy: 'created_at' }),
      listForActivity: (id) =>
        schedules.query({ where: ['activity_id = ?'], params: [id], orderBy: 'created_at' }),
      save: (s) => schedules.save(s),
      delete: (id) => schedules.remove(id),
    },
    occurrences: {
      getById: (id) => occurrences.getById(id),
      list: (f) => {
        const where: string[] = [];
        const params: SqlValue[] = [];
        if (f.activityId !== undefined) add(where, params, 'activity_id = ?', f.activityId);
        if (f.status !== undefined) {
          if (f.status.length === 0) where.push('0 = 1');
          else add(where, params, `status IN (${placeholders(f.status.length)})`, ...f.status);
        }
        if (f.dueFrom !== undefined) add(where, params, 'due_on >= ?', f.dueFrom);
        if (f.dueTo !== undefined) add(where, params, 'due_on <= ?', f.dueTo);
        return occurrences.query({
          where,
          params,
          orderBy:
            f.order === 'due_desc' ? 'due_on DESC, created_at DESC' : 'due_on ASC, created_at ASC',
          page: f,
        });
      },
      save: (o) => occurrences.save(o),
      delete: (id) => occurrences.remove(id),
    },
    completions: {
      getById: (id) => completions.getById(id),
      add: (c) => completions.append(c),
      list: (f) => {
        const where: string[] = [];
        const params: SqlValue[] = [];
        if (f.activityId !== undefined) add(where, params, 'activity_id = ?', f.activityId);
        if (f.from !== undefined) add(where, params, 'completed_at >= ?', f.from);
        if (f.to !== undefined) add(where, params, 'completed_at <= ?', f.to);
        if (!f.includeVoided) where.push(NOT_VOIDED);
        return completions.query({
          where,
          params,
          orderBy: 'completed_at DESC, created_at DESC',
          page: f,
        });
      },
    },
    reminders: {
      getById: (id) => reminders.getById(id),
      list: (f) => {
        const where: string[] = [];
        const params: SqlValue[] = [];
        if (f?.activityId !== undefined) add(where, params, 'activity_id = ?', f.activityId);
        return reminders.query({ where, params, orderBy: 'created_at ASC' });
      },
      save: (r) => reminders.save(r),
      delete: (id) => reminders.remove(id),
    },
    reminderDeliveries: {
      add: (d) => reminderDeliveries.append(d),
      keys: async () => {
        const rows = await reminderDeliveries.query({ orderBy: 'delivered_at ASC' });
        return new Set(rows.map((d) => deliveryKey(d.reminderId, d.occurrenceId, d.dueOn)));
      },
      list: () => reminderDeliveries.query({ orderBy: 'delivered_at ASC' }),
    },
    completionVoids: {
      add: (v) => completionVoids.append(v),
      getByCompletion: async (completionId) =>
        (
          await completionVoids.query({
            where: ['completion_id = ?'],
            params: [completionId],
            orderBy: 'voided_at ASC',
          })
        )[0] ?? null,
      list: () => completionVoids.query({ orderBy: 'voided_at ASC' }),
    },
    measurements: {
      add: (m) => measurements.append(m),
      list: (f) => {
        // A measurement belongs to its completion: undoing the completion hides it too.
        const where: string[] = [
          '(completion_id IS NULL OR completion_id NOT IN (SELECT completion_id FROM completion_voids))',
        ];
        const params: SqlValue[] = [];
        if (f.assetId !== undefined) add(where, params, 'asset_id = ?', f.assetId);
        if (f.activityId !== undefined) add(where, params, 'activity_id = ?', f.activityId);
        if (f.key !== undefined) add(where, params, 'key = ?', f.key);
        if (f.from !== undefined) add(where, params, 'measured_at >= ?', f.from);
        if (f.to !== undefined) add(where, params, 'measured_at <= ?', f.to);
        return measurements.query({
          where,
          params,
          orderBy: 'measured_at DESC, created_at DESC',
          page: f,
        });
      },
    },
    audit: {
      add: (e) => audit.append(e),
      list: (f) => audit.query({ orderBy: 'occurred_at DESC, created_at DESC', page: f }),
    },
  };
}

/**
 * Repositories over a database. Each write runs in its own transaction; for
 * multi-step operations use `createSqlUnitOfWork`.
 */
export function createSqlRepositories(db: SqlDatabase): Repositories {
  return buildRepositories({ read: db, write: (work) => db.writeTransaction(work) });
}

/** Runs the whole operation in one database transaction, rolling back if it throws. */
export function createSqlUnitOfWork(db: SqlDatabase): UnitOfWork {
  return {
    run: (work) =>
      db.writeTransaction((tx) =>
        work(buildRepositories({ read: tx, write: (inner) => inner(tx) })),
      ),
  };
}
