import { Issues, isNonBlank } from '../core';
import type {
  AttachmentId,
  CategoryId,
  DomainError,
  Instant,
  LocationId,
  Result,
  UserId,
} from '../core';
import { newMeta, type EntityMeta } from './meta';

export interface Category {
  readonly id: CategoryId;
  readonly meta: EntityMeta;
  readonly name: string;
  readonly description?: string | undefined;
}

export type LocationKind = 'room' | 'area' | 'place';

export interface Location {
  readonly id: LocationId;
  readonly meta: EntityMeta;
  readonly name: string;
  readonly kind: LocationKind;
  readonly parentId?: LocationId | undefined;
}

/**
 * `uploaded` means the bytes are in the attachment storage (on this device in Phase 1).
 * Whether the bytes are actually present is checked when listing, so a restored or synced
 * record whose file never arrived shows as missing without any stored flag going stale.
 */
export type AttachmentStatus = 'pending_upload' | 'uploaded' | 'failed' | 'missing';

/** The largest single file Phase 1 accepts (spec 10; see GAPS G-07). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface AttachmentSubject {
  readonly type: 'activity' | 'asset' | 'completion';
  readonly id: string;
}

export interface Attachment {
  readonly id: AttachmentId;
  readonly meta: EntityMeta;
  readonly subject: AttachmentSubject;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** SHA-256 of the file, lowercase hex; lets a restore verify the bytes. */
  readonly sha256: string;
  readonly status: AttachmentStatus;
  readonly uploadedAt?: Instant | undefined;
}

export interface NewCategory {
  readonly id: CategoryId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly name: string;
  readonly description?: string | undefined;
}

export function createCategory(input: NewCategory): Result<Category, DomainError> {
  const issues = new Issues();
  issues.check(isNonBlank(input.name), 'name', 'is required');
  issues.check(input.name.trim().length <= 100, 'name', 'must be 100 characters or fewer');
  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
  }));
}

export interface NewLocation {
  readonly id: LocationId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly name: string;
  readonly kind?: LocationKind | undefined;
  readonly parentId?: LocationId | undefined;
}

export function createLocation(input: NewLocation): Result<Location, DomainError> {
  const issues = new Issues();
  issues.check(isNonBlank(input.name), 'name', 'is required');
  issues.check(input.name.trim().length <= 100, 'name', 'must be 100 characters or fewer');
  issues.check(input.parentId !== input.id, 'parentId', 'a place cannot be inside itself');
  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    name: input.name.trim(),
    kind: input.kind ?? 'place',
    parentId: input.parentId,
  }));
}

export interface NewAttachment {
  readonly id: AttachmentId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly subject: AttachmentSubject;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export function createAttachment(input: NewAttachment): Result<Attachment, DomainError> {
  const issues = new Issues();
  issues.check(isNonBlank(input.fileName), 'fileName', 'is required');
  issues.check(input.fileName.length <= 255, 'fileName', 'must be 255 characters or fewer');
  issues.check(input.sizeBytes > 0, 'file', 'is empty');
  issues.check(
    input.sizeBytes <= MAX_ATTACHMENT_BYTES,
    'file',
    `is too large (the limit is ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB)`,
  );
  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    subject: input.subject,
    fileName: input.fileName.trim(),
    mimeType: input.mimeType || 'application/octet-stream',
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    status: 'uploaded',
    uploadedAt: input.now,
  }));
}
