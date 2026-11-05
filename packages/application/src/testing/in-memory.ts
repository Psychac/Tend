import {
  ConflictError,
  type ActivityFilter,
  type AssetFilter,
  type CompletionFilter,
  type MeasurementFilter,
  type OccurrenceFilter,
  type Page,
  type Repositories,
  type UnitOfWork,
} from '@upkeep/contracts';
import type {
  Activity,
  Asset,
  AuditEvent,
  Category,
  Completion,
  EntityMeta,
  Location,
  Measurement,
  Occurrence,
  Schedule,
} from '@upkeep/domain';

interface Row {
  readonly id: string;
  readonly meta: EntityMeta;
}

const paged = <T>(rows: T[], { limit, offset = 0 }: Page): T[] =>
  rows.slice(offset, limit === undefined ? undefined : offset + limit);

/** Mutable entities are version-checked; append-only ones ignore duplicate ids. */
class Table<T extends Row> {
  private rows = new Map<string, T>();

  get(id: string): T | null {
    return this.rows.get(id) ?? null;
  }

  all(): T[] {
    return [...this.rows.values()];
  }

  save(row: T): void {
    const existing = this.rows.get(row.id);
    if (existing && row.meta.version !== existing.meta.version + 1) {
      throw new ConflictError(
        `${row.id} is at version ${existing.meta.version}; cannot save version ${row.meta.version}`,
      );
    }
    this.rows.set(row.id, row);
  }

  append(row: T): void {
    if (!this.rows.has(row.id)) this.rows.set(row.id, row);
  }

  remove(id: string): void {
    this.rows.delete(id);
  }

  snapshot(): Map<string, T> {
    return new Map(this.rows);
  }

  restore(snapshot: Map<string, T>): void {
    this.rows = new Map(snapshot);
  }
}

/** A complete in-memory store implementing the repository and unit-of-work contracts. */
export function createInMemoryStore(): { repos: Repositories; uow: UnitOfWork } {
  const activities = new Table<Activity>();
  const assets = new Table<Asset>();
  const categories = new Table<Category>();
  const locations = new Table<Location>();
  const schedules = new Table<Schedule>();
  const occurrences = new Table<Occurrence>();
  const completions = new Table<Completion>();
  const measurements = new Table<Measurement>();
  const audit = new Table<AuditEvent>();
  const tables = [
    activities,
    assets,
    categories,
    locations,
    schedules,
    occurrences,
    completions,
    measurements,
    audit,
  ] as const;

  const repos: Repositories = {
    activities: {
      getById: async (id) => activities.get(id),
      list: async (f: ActivityFilter) =>
        paged(
          activities
            .all()
            .filter(
              (a) =>
                (f.includeArchived || a.archivedAt === undefined) &&
                (f.type === undefined || a.type === f.type) &&
                (f.categoryId === undefined || a.categoryId === f.categoryId) &&
                (f.locationId === undefined || a.locationId === f.locationId) &&
                (f.assetId === undefined || a.assetId === f.assetId) &&
                (f.search === undefined || a.name.toLowerCase().includes(f.search.toLowerCase())),
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
          f,
        ),
      save: async (a) => activities.save(a),
      delete: async (id) => activities.remove(id),
    },
    assets: {
      getById: async (id) => assets.get(id),
      list: async (f: AssetFilter) =>
        paged(
          assets
            .all()
            .filter(
              (a) =>
                (f.status === undefined || a.status === f.status) &&
                (f.categoryId === undefined || a.categoryId === f.categoryId) &&
                (f.locationId === undefined || a.locationId === f.locationId) &&
                (f.search === undefined || a.name.toLowerCase().includes(f.search.toLowerCase())),
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
          f,
        ),
      save: async (a) => assets.save(a),
      delete: async (id) => assets.remove(id),
    },
    categories: {
      getById: async (id) => categories.get(id),
      list: async () => categories.all(),
      save: async (c) => categories.save(c),
      delete: async (id) => categories.remove(id),
    },
    locations: {
      getById: async (id) => locations.get(id),
      list: async () => locations.all(),
      save: async (l) => locations.save(l),
      delete: async (id) => locations.remove(id),
    },
    schedules: {
      getById: async (id) => schedules.get(id),
      list: async () => schedules.all(),
      listForActivity: async (id) => schedules.all().filter((s) => s.activityId === id),
      save: async (s) => schedules.save(s),
      delete: async (id) => schedules.remove(id),
    },
    occurrences: {
      getById: async (id) => occurrences.get(id),
      list: async (f: OccurrenceFilter) => {
        const rows = occurrences
          .all()
          .filter(
            (o) =>
              (f.activityId === undefined || o.activityId === f.activityId) &&
              (f.status === undefined || f.status.includes(o.status)) &&
              (f.dueFrom === undefined || o.dueOn >= f.dueFrom) &&
              (f.dueTo === undefined || o.dueOn <= f.dueTo),
          )
          .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
        return paged(f.order === 'due_desc' ? rows.reverse() : rows, f);
      },
      save: async (o) => occurrences.save(o),
    },
    completions: {
      getById: async (id) => completions.get(id),
      add: async (c) => completions.append(c),
      list: async (f: CompletionFilter) =>
        paged(
          completions
            .all()
            .reverse() // ties on timestamp resolve to the most recently added
            .filter(
              (c) =>
                (f.activityId === undefined || c.activityId === f.activityId) &&
                (f.from === undefined || c.completedAt >= f.from) &&
                (f.to === undefined || c.completedAt <= f.to),
            )
            .sort((a, b) =>
              a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0,
            ),
          f,
        ),
    },
    measurements: {
      add: async (m) => measurements.append(m),
      list: async (f: MeasurementFilter) =>
        paged(
          measurements
            .all()
            .reverse() // ties on timestamp resolve to the most recently added
            .filter(
              (m) =>
                (f.assetId === undefined || m.assetId === f.assetId) &&
                (f.activityId === undefined || m.activityId === f.activityId) &&
                (f.key === undefined || m.key === f.key) &&
                (f.from === undefined || m.measuredAt >= f.from) &&
                (f.to === undefined || m.measuredAt <= f.to),
            )
            .sort((a, b) =>
              a.measuredAt < b.measuredAt ? 1 : a.measuredAt > b.measuredAt ? -1 : 0,
            ),
          f,
        ),
    },
    audit: {
      add: async (e) => audit.append(e),
      list: async (f: Page) => paged(audit.all(), f),
    },
  };

  const uow: UnitOfWork = {
    async run(work) {
      const snapshots = tables.map((t) => t.snapshot());
      try {
        return await work(repos);
      } catch (e) {
        tables.forEach((t, i) => (t as Table<Row>).restore(snapshots[i] as Map<string, Row>));
        throw e;
      }
    },
  };

  return { repos, uow };
}
