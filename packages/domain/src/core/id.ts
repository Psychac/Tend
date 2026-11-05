import { validationError, type DomainError } from './errors';
import { err, ok, type Result } from './result';

declare const brand: unique symbol;
export type Brand<T, B> = T & { readonly [brand]: B };

/** UUID-backed identifier, tagged by entity kind so ids cannot be mixed up. */
export type Id<K extends string> = Brand<string, K>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseId<K extends string>(kind: K, raw: string): Result<Id<K>, DomainError> {
  return UUID.test(raw)
    ? ok(raw as Id<K>)
    : err(validationError([{ path: kind, message: 'must be a lowercase UUID' }]));
}

/** Supplied by infrastructure (e.g. crypto.randomUUID) so the domain stays pure. */
export interface IdGenerator {
  next<K extends string>(): Id<K>;
}

export type UserId = Id<'User'>;
export type CategoryId = Id<'Category'>;
export type LocationId = Id<'Location'>;
export type AssetId = Id<'Asset'>;
export type ActivityId = Id<'Activity'>;
export type ScheduleId = Id<'Schedule'>;
export type OccurrenceId = Id<'Occurrence'>;
export type CompletionId = Id<'Completion'>;
export type CompletionVoidId = Id<'CompletionVoid'>;
export type MeasurementId = Id<'Measurement'>;
export type ReminderId = Id<'Reminder'>;
export type AttachmentId = Id<'Attachment'>;
export type AuditEventId = Id<'AuditEvent'>;
export type ChecklistItemId = Id<'ChecklistItem'>;
