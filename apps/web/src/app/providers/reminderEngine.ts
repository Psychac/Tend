import { deliverDueReminders } from '@tend/application';
import { deviceTimeZone } from '../../shared/hooks';
import { describeReminders, getNotificationsEnabled, type Notifier } from '../../shared/notifier';
import type { AppServices } from './AppProvider';

/**
 * Shows any reminders that have come due as a browser notification, if this
 * device has them switched on and the browser allows it. Safe to call as often
 * as you like: what was delivered is remembered, so nothing appears twice. When
 * notifications are off or not permitted, nothing is marked delivered, so the
 * reminders are still waiting if they are switched on later.
 */
export async function runReminders(services: AppServices, notifier: Notifier): Promise<void> {
  if (!getNotificationsEnabled() || notifier.permission() !== 'granted') return;
  const result = await deliverDueReminders(services.deps, {
    now: services.deps.clock.now(),
    timeZone: deviceTimeZone(),
    deliver: (batch) => notifier.show(describeReminders(batch.items)),
  });
  if (!result.ok) console.error('Could not deliver reminders', result.error);
}

/** How often to check while the app is open. A browser may pause this in the background; that is fine. */
export const REMINDER_CHECK_MS = 60_000;
