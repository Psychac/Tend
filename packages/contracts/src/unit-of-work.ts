import type {
  ActivityRepository,
  AssetRepository,
  AuditEventRepository,
  CategoryRepository,
  CompletionRepository,
  LocationRepository,
  MeasurementRepository,
  OccurrenceRepository,
  ScheduleRepository,
} from './repositories';

export interface Repositories {
  readonly activities: ActivityRepository;
  readonly assets: AssetRepository;
  readonly categories: CategoryRepository;
  readonly locations: LocationRepository;
  readonly schedules: ScheduleRepository;
  readonly occurrences: OccurrenceRepository;
  readonly completions: CompletionRepository;
  readonly measurements: MeasurementRepository;
  readonly audit: AuditEventRepository;
}

/**
 * Raised by a repository when a save would overwrite a newer revision. Use
 * cases translate it into a `conflict` DomainError.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

/**
 * Runs a multi-repository operation atomically: if `work` throws, every write
 * it made through the supplied repositories is rolled back. A completion
 * touches an occurrence, a completion record, measurements and audit events,
 * and must not leave a half-written result after a crash.
 */
export interface UnitOfWork {
  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>;
}
