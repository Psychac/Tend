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

export type AttachmentStatus = 'pending_upload' | 'uploaded' | 'failed' | 'missing';

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
