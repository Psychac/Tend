/**
 * Remembers, on this device only, when a backup was last saved and when the reminder was last
 * put off. It is a hint for a nudge, not part of the data, so it lives in localStorage and
 * everything still works if that is unavailable.
 */
const SAVED_KEY = 'tend.lastBackup';
const LATER_KEY = 'tend.backupLater';

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the reminder simply keeps showing.
  }
};

export const markBackedUp = (nowIso: string): void => write(SAVED_KEY, nowIso);
export const putOffBackupReminder = (nowIso: string): void => write(LATER_KEY, nowIso);

const DAY = 86_400_000;
export const BACKUP_STALE_DAYS = 30;
export const BACKUP_LATER_DAYS = 7;

/** Whether to remind the person to back up: never done, or older than 30 days, and not put off lately. */
export function backupReminder(nowIso: string): { due: boolean; lastDays: number | null } {
  const now = Date.parse(nowIso);
  const saved = read(SAVED_KEY);
  const later = read(LATER_KEY);
  const lastDays = saved ? Math.floor((now - Date.parse(saved)) / DAY) : null;
  const stale = lastDays === null || lastDays >= BACKUP_STALE_DAYS;
  const putOff = later !== null && now - Date.parse(later) < BACKUP_LATER_DAYS * DAY;
  return { due: stale && !putOff, lastDays };
}
