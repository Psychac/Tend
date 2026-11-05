import type {
  Activity,
  ActivityId,
  ActivityType,
  Asset,
  AssetId,
  AssetStatus,
  AuditEvent,
  Category,
  CategoryId,
  Completion,
  CompletionId,
  Instant,
  LocalDate,
  Location,
  LocationId,
  Measurement,
  Occurrence,
  OccurrenceId,
  OccurrenceStatus,
  Schedule,
  ScheduleId,
} from '@upkeep/domain';

/**
 * Repositories are scoped to the signed-in user by the implementation; callers
 * never pass an owner id. Domain and application code depend on these
 * contracts, never on PowerSync or SQL types (spec 9.2).
 *
 * Mutable entities are saved with their `meta.version`. An implementation must
 * reject a stale save with a `conflict` error rather than overwrite silently.
 */

export interface Page {
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

export interface ActivityFilter extends Page {
  readonly type?: ActivityType | undefined;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly assetId?: AssetId | undefined;
  readonly includeArchived?: boolean | undefined;
  readonly search?: string | undefined;
}

export interface ActivityRepository {
  getById(id: ActivityId): Promise<Activity | null>;
  list(filter: ActivityFilter): Promise<Activity[]>;
  save(activity: Activity): Promise<void>;
  delete(id: ActivityId): Promise<void>;
}

export interface AssetFilter extends Page {
  readonly status?: AssetStatus | undefined;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly search?: string | undefined;
}

export interface AssetRepository {
  getById(id: AssetId): Promise<Asset | null>;
  list(filter: AssetFilter): Promise<Asset[]>;
  save(asset: Asset): Promise<void>;
  delete(id: AssetId): Promise<void>;
}

export interface CategoryRepository {
  getById(id: CategoryId): Promise<Category | null>;
  list(): Promise<Category[]>;
  save(category: Category): Promise<void>;
  delete(id: CategoryId): Promise<void>;
}

export interface LocationRepository {
  getById(id: LocationId): Promise<Location | null>;
  list(): Promise<Location[]>;
  save(location: Location): Promise<void>;
  delete(id: LocationId): Promise<void>;
}

export interface ScheduleRepository {
  getById(id: ScheduleId): Promise<Schedule | null>;
  listForActivity(activityId: ActivityId): Promise<Schedule[]>;
  save(schedule: Schedule): Promise<void>;
  delete(id: ScheduleId): Promise<void>;
}

export interface OccurrenceFilter extends Page {
  readonly activityId?: ActivityId | undefined;
  readonly status?: readonly OccurrenceStatus[] | undefined;
  readonly dueFrom?: LocalDate | undefined;
  readonly dueTo?: LocalDate | undefined;
}

export interface OccurrenceRepository {
  getById(id: OccurrenceId): Promise<Occurrence | null>;
  list(filter: OccurrenceFilter): Promise<Occurrence[]>;
  /** Idempotent: saving an occurrence with an existing id replaces it. */
  save(occurrence: Occurrence): Promise<void>;
}

export interface CompletionFilter extends Page {
  readonly activityId?: ActivityId | undefined;
  readonly from?: Instant | undefined;
  readonly to?: Instant | undefined;
}

/** Completions are append-only: there is no update or delete. */
export interface CompletionRepository {
  getById(id: CompletionId): Promise<Completion | null>;
  add(completion: Completion): Promise<void>;
  list(filter: CompletionFilter): Promise<Completion[]>;
}

export interface MeasurementFilter extends Page {
  readonly assetId?: AssetId | undefined;
  readonly activityId?: ActivityId | undefined;
  readonly key?: string | undefined;
  readonly from?: Instant | undefined;
  readonly to?: Instant | undefined;
}

/** Measurements are append-only. */
export interface MeasurementRepository {
  add(measurement: Measurement): Promise<void>;
  list(filter: MeasurementFilter): Promise<Measurement[]>;
}

export interface AuditEventRepository {
  add(event: AuditEvent): Promise<void>;
  list(filter: Page): Promise<AuditEvent[]>;
}
