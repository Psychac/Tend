import type { Instant, UserId } from '../core';

/**
 * Metadata carried by every user-owned entity.
 * Sync-transport fields (client_id, client_mutation_id) belong to the upload
 * envelope in infrastructure, not to the domain entity.
 */
export interface EntityMeta {
  readonly ownerId: UserId;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  /** Revision number; a stale update must not overwrite a newer one (spec 7.6). */
  readonly version: number;
}

export const newMeta = (ownerId: UserId, now: Instant): EntityMeta => ({
  ownerId,
  createdAt: now,
  updatedAt: now,
  version: 1,
});

export const touch = (meta: EntityMeta, now: Instant): EntityMeta => ({
  ...meta,
  updatedAt: now,
  version: meta.version + 1,
});
