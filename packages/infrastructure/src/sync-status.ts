import type { SyncStatus, SyncStatusSource } from '@tend/contracts';

const LOCAL_ONLY: SyncStatus = {
  state: 'local-only',
  label: 'Saved on this device',
  detail: 'Sync is not enabled, so your data lives only on this device. Keep a backup.',
};

/** Phase 1: nothing syncs, so the status never changes. */
export const localOnlySyncStatus: SyncStatusSource = {
  current: () => LOCAL_ONLY,
  subscribe: () => () => undefined,
};
