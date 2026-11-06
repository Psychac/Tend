import type { AttachmentId } from '@tend/domain';

export interface StoredFileInfo {
  readonly id: AttachmentId;
  /** Milliseconds since the epoch. */
  readonly modifiedAt: number;
}

/**
 * Where attachment bytes live, kept apart from the database (spec 10). Provider-neutral:
 * Phase 1 keeps files on the device; a remote provider can replace it later (G-41).
 * Files are keyed by attachment id.
 */
export interface AttachmentStorage {
  /** Stores or replaces a file. Rejects, storing nothing, if the device is full. */
  put(id: AttachmentId, data: Blob): Promise<void>;
  /** The file, or null if its bytes are not here. */
  get(id: AttachmentId): Promise<Blob | null>;
  /** Removes a file. Removing one that is not there is not an error. */
  remove(id: AttachmentId): Promise<void>;
  /** Every stored file, for finding ones no record refers to. */
  list(): Promise<StoredFileInfo[]>;
}
