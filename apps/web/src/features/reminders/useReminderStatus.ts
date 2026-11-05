import { getReminderStatus, type ReminderStatus } from '@tend/application';
import { deviceTimeZone, useLiveQuery, useTick, type Loadable } from '../../shared/hooks';

/** What the person should be reminded about right now; refreshes as time passes. */
export function useReminderStatus(): Loadable<ReminderStatus> {
  const tick = useTick();
  return useLiveQuery(
    ({ repos, deps }) =>
      getReminderStatus(repos, { now: deps.clock.now(), timeZone: deviceTimeZone() }),
    `reminders:${tick}`,
  );
}
