import type {
  ActivityId,
  AttachmentId,
  CategoryId,
  Instant,
  LocationId,
  ReminderId,
} from '../core';
import type { EntityMeta } from './meta';

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

export type ReminderChannel = 'in_app' | 'browser';

/** Delivery preference only; whether something is due is decided by scheduling (spec 11). */
export interface Reminder {
  readonly id: ReminderId;
  readonly meta: EntityMeta;
  readonly activityId: ActivityId;
  readonly channel: ReminderChannel;
  readonly leadMinutes: number;
  readonly enabled: boolean;
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
