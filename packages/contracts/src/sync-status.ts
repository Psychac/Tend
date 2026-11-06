/**
 * What the person is told about whether their data is safe and current (spec 7.1, 7.7).
 * - local-only: saved on this device; sync is not enabled (Phase 1)
 * - offline: sync is enabled but there is no connection; changes are queued
 * - syncing: changes are being exchanged
 * - synced: everything is up to date
 * - attention: something needs the person (for example a conflict)
 * - unavailable: sync is enabled but cannot work right now
 */
export type SyncState =
  'local-only' | 'offline' | 'syncing' | 'synced' | 'attention' | 'unavailable';

export interface SyncStatus {
  readonly state: SyncState;
  /** Short, always shown. */
  readonly label: string;
  /** One sentence of explanation. */
  readonly detail: string;
}

/** Where the app learns the sync state. Phase 2 provides a PowerSync-backed source. */
export interface SyncStatusSource {
  current(): SyncStatus;
  /** Calls `listener` whenever the status changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
