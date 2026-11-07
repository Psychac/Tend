import { useSyncExternalStore } from 'react';
import type { SyncState } from '@tend/contracts';
import { useApp } from '../../app/providers/AppProvider';

const TONE: Record<SyncState, string> = {
  'local-only': 'bg-info',
  offline: 'bg-faint',
  syncing: 'bg-info',
  synced: 'bg-ok',
  attention: 'bg-warn-solid',
  unavailable: 'bg-danger',
};

/** Shows where the data is kept. Driven only by the SyncStatusSource contract. */
export function SyncIndicator({
  className = '',
  showDetail = false,
}: {
  className?: string;
  showDetail?: boolean;
}) {
  const { syncStatus } = useApp();
  const status = useSyncExternalStore(syncStatus.subscribe, syncStatus.current);
  return (
    <p
      role="status"
      title={status.detail}
      aria-label={`${status.label}. ${status.detail}`}
      className={`flex items-center gap-1.5 text-xs text-muted ${className}`}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${TONE[status.state]}`} />
      <span>
        {status.label}
        {showDetail ? <span className="text-faint"> &middot; {status.detail}</span> : null}
      </span>
    </p>
  );
}
