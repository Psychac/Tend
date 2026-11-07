import type {
  Activity,
  ActivityId,
  ActivityType,
  Asset,
  Attachment,
  AttachmentId,
  AttachmentSubject,
  AssetId,
  AssetStatus,
  AuditEvent,
  Category,
  CategoryId,
  Completion,
  CompletionId,
  CompletionVoid,
  Reminder,
  ReminderDelivery,
  ReminderId,
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
} from '@tend/domain';

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
  list(): Promise<Schedule[]>;
  listForActivity(activityId: ActivityId): Promise<Schedule[]>;
  save(schedule: Schedule): Promise<void>;
  delete(id: ScheduleId): Promise<void>;
}

export interface OccurrenceFilter extends Page {
  readonly activityId?: ActivityId | undefined;
  readonly status?: readonly OccurrenceStatus[] | undefined;
  readonly dueFrom?: LocalDate | undefined;
  readonly dueTo?: LocalDate | undefined;
  /** Ordering by `dueOn`; defaults to ascending. */
  readonly order?: 'due_asc' | 'due_desc' | undefined;
}

export interface OccurrenceRepository {
  getById(id: OccurrenceId): Promise<Occurrence | null>;
  list(filter: OccurrenceFilter): Promise<Occurrence[]>;
  /** Version-checked like other mutable entities. */
  save(occurrence: Occurrence): Promise<void>;
  /** Only for removing an activity that was never done. */
  delete(id: OccurrenceId): Promise<void>;
}

export interface CompletionFilter extends Page {
  /** Voided completions (undone or replaced) are hidden unless asked for. */
  readonly includeVoided?: boolean | undefined;
  readonly activityId?: ActivityId | undefined;
  readonly from?: Instant | undefined;
  readonly to?: Instant | undefined;
}

/**
 * Completions are append-only: there is no update or delete. Adding an id that
 * already exists is a no-op, which makes retried uploads idempotent.
 * `list` returns the newest completion first.
 */
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

/** Measurements are append-only (duplicate ids are a no-op). `list` returns the newest first. */
export interface MeasurementRepository {
  add(measurement: Measurement): Promise<void>;
  list(filter: MeasurementFilter): Promise<Measurement[]>;
}

export interface AuditEventRepository {
  add(event: AuditEvent): Promise<void>;
  list(filter: Page): Promise<AuditEvent[]>;
}

/** Append-only. Hides a completion, and its measurements, from every list. */
export interface CompletionVoidRepository {
  add(entry: CompletionVoid): Promise<void>;
  /** The void for this completion, if it has been undone or replaced. */
  getByCompletion(completionId: CompletionId): Promise<CompletionVoid | null>;
  list(): Promise<CompletionVoid[]>;
}

export interface ReminderFilter {
  readonly activityId?: ActivityId | undefined;
}

export interface ReminderRepository {
  getById(id: ReminderId): Promise<Reminder | null>;
  list(filter?: ReminderFilter): Promise<Reminder[]>;
  save(reminder: Reminder): Promise<void>;
  delete(id: ReminderId): Promise<void>;
}

/** Append-only record of what has been delivered, so nothing is delivered twice. */
export interface ReminderDeliveryRepository {
  add(delivery: ReminderDelivery): Promise<void>;
  /** The keys (`deliveryKey`) of every delivery on record. */
  keys(): Promise<Set<string>>;
  list(): Promise<ReminderDelivery[]>;
}

export interface AttachmentRepository {
  getById(id: AttachmentId): Promise<Attachment | null>;
  /** The files attached to one activity, asset or completion, oldest first. */
  listBySubject(subject: AttachmentSubject): Promise<Attachment[]>;
  list(): Promise<Attachment[]>;
  save(attachment: Attachment): Promise<void>;
  delete(id: AttachmentId): Promise<void>;
}
