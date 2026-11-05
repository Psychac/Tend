import { Issues, isBefore, isNonBlank } from '../core';
import type {
  ActivityId,
  AssetId,
  AuditEventId,
  ChecklistItemId,
  CompletionId,
  CompletionVoidId,
  DomainError,
  Instant,
  LocalDate,
  MeasurementId,
  Money,
  OccurrenceId,
  Quantity,
  Result,
  UserId,
} from '../core';
import { newMeta, type EntityMeta } from './meta';

export interface ChecklistResult {
  readonly itemId: ChecklistItemId;
  readonly done: boolean;
}

/**
 * Append-only record that an activity was done (spec 7.6). Planned and actual
 * dates are kept separately so later features can reason about timeliness.
 */
export interface Completion {
  readonly id: CompletionId;
  readonly meta: EntityMeta;
  readonly activityId: ActivityId;
  readonly occurrenceId?: OccurrenceId | undefined;
  readonly completedAt: Instant;
  readonly plannedFor?: LocalDate | undefined;
  readonly notes?: string | undefined;
  readonly cost?: Money | undefined;
  readonly checklistResults: readonly ChecklistResult[];
  readonly deviationReason?: string | undefined;
}

export interface NewCompletion {
  readonly id: CompletionId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly activityId: ActivityId;
  readonly occurrenceId?: OccurrenceId | undefined;
  /** Defaults to now; may be backdated but not set in the future. */
  readonly completedAt?: Instant | undefined;
  readonly plannedFor?: LocalDate | undefined;
  readonly notes?: string | undefined;
  readonly cost?: Money | undefined;
  readonly checklistResults?: readonly ChecklistResult[] | undefined;
  readonly deviationReason?: string | undefined;
}

export function createCompletion(input: NewCompletion): Result<Completion, DomainError> {
  const completedAt = input.completedAt ?? input.now;
  const issues = new Issues();

  issues.check(!isBefore(input.now, completedAt), 'completedAt', 'cannot be in the future');
  issues.check(!input.cost || input.cost.minor >= 0, 'cost', 'cannot be negative');

  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    activityId: input.activityId,
    occurrenceId: input.occurrenceId,
    completedAt,
    plannedFor: input.plannedFor,
    notes: input.notes?.trim() || undefined,
    cost: input.cost,
    checklistResults: input.checklistResults ?? [],
    deviationReason: input.deviationReason?.trim() || undefined,
  }));
}

export type MeasurementValue =
  | { readonly kind: 'numeric'; readonly quantity: Quantity }
  | { readonly kind: 'qualitative'; readonly label: string };

/** Append-only measurement, attached to an asset and/or an activity. */
export interface Measurement {
  readonly id: MeasurementId;
  readonly meta: EntityMeta;
  readonly key: string;
  readonly value: MeasurementValue;
  readonly measuredAt: Instant;
  readonly assetId?: AssetId | undefined;
  readonly activityId?: ActivityId | undefined;
  readonly completionId?: CompletionId | undefined;
}

export interface NewMeasurement {
  readonly id: MeasurementId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly key: string;
  readonly value: MeasurementValue;
  readonly measuredAt?: Instant | undefined;
  readonly assetId?: AssetId | undefined;
  readonly activityId?: ActivityId | undefined;
  readonly completionId?: CompletionId | undefined;
}

export function createMeasurement(input: NewMeasurement): Result<Measurement, DomainError> {
  const measuredAt = input.measuredAt ?? input.now;
  const issues = new Issues();

  issues.check(isNonBlank(input.key), 'key', 'is required');
  issues.check(!isBefore(input.now, measuredAt), 'measuredAt', 'cannot be in the future');
  issues.check(
    input.assetId !== undefined || input.activityId !== undefined,
    'subject',
    'must reference an asset or an activity',
  );
  if (input.value.kind === 'numeric') {
    issues.check(Number.isFinite(input.value.quantity.value), 'value', 'must be finite');
    issues.check(isNonBlank(input.value.quantity.unit), 'value.unit', 'is required');
  } else {
    issues.check(isNonBlank(input.value.label), 'value', 'label is required');
  }

  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    key: input.key.trim(),
    value: input.value,
    measuredAt,
    assetId: input.assetId,
    activityId: input.activityId,
    completionId: input.completionId,
  }));
}

export type AuditAction = 'created' | 'updated' | 'deleted' | 'archived' | 'restored';

export interface AuditEvent {
  readonly id: AuditEventId;
  readonly meta: EntityMeta;
  readonly entityType: string;
  readonly entityId: string;
  readonly action: AuditAction;
  readonly occurredAt: Instant;
  readonly summary?: string | undefined;
}

/**
 * Append-only note that a completion should no longer count: it was recorded by
 * mistake, or replaced by a corrected one. The completion itself is never
 * changed, so every device agrees on it and the original stays on record.
 */
export interface CompletionVoid {
  readonly id: CompletionVoidId;
  readonly meta: EntityMeta;
  readonly completionId: CompletionId;
  readonly voidedAt: Instant;
  /** The corrected completion that took its place, if this was an edit rather than an undo. */
  readonly replacedBy?: CompletionId | undefined;
  readonly reason?: string | undefined;
}

export interface NewCompletionVoid {
  readonly id: CompletionVoidId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly completionId: CompletionId;
  readonly replacedBy?: CompletionId | undefined;
  readonly reason?: string | undefined;
}

export function createCompletionVoid(
  input: NewCompletionVoid,
): Result<CompletionVoid, DomainError> {
  const issues = new Issues();
  issues.check(
    input.replacedBy === undefined || input.replacedBy !== input.completionId,
    'replacedBy',
    'cannot replace itself',
  );
  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    completionId: input.completionId,
    voidedAt: input.now,
    replacedBy: input.replacedBy,
    reason: input.reason?.trim() || undefined,
  }));
}
