import { useEffect } from 'react';
import { useReminderStatus } from './useReminderStatus';

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** How many reminders are waiting; also set as the installed app's icon badge where supported. */
export function useReminderCount(): number {
  const status = useReminderStatus();
  const count = status.status === 'ready' ? status.data.fired.length : 0;

  useEffect(() => {
    const nav = navigator as BadgeNavigator;
    // Badging is a nicety; a failure here must never matter.
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => undefined);
    else void nav.clearAppBadge?.()?.catch(() => undefined);
  }, [count]);

  return count;
}
