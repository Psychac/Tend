const CHANNEL = 'tend-changes';
const MAINTENANCE_LOCK = 'tend-maintenance';

export interface ChangeChannel {
  /** Tells the other open tabs that data changed. */
  announce(): void;
  close(): void;
}

/**
 * Lets tabs of the same app tell each other that data changed, so a completion in one
 * shows up in the others without a reload. Both tabs share one database; this only
 * carries the "re-read now" signal. Without BroadcastChannel a tab simply refreshes
 * on its own next load.
 */
export function openChangeChannel(onRemoteChange: () => void): ChangeChannel {
  if (typeof BroadcastChannel === 'undefined') return { announce() {}, close() {} };
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = () => onRemoteChange();
  return {
    announce: () => channel.postMessage('changed'),
    close: () => channel.close(),
  };
}

/**
 * Runs `work` in at most one tab at a time (schedule reconcile, reminder checks). Tabs queue rather than skip, so a reminder
 * check in one tab always sees what another tab delivered, and nothing is shown twice.
 * Where the browser has no Web Locks, it just runs.
 */
export function exclusiveAcrossTabs<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(MAINTENANCE_LOCK, work) : work();
}
