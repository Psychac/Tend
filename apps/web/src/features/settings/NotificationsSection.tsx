import { useState } from 'react';
import { useApp } from '../../app/providers/AppProvider';
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
  type NotificationSupport,
} from '../../infrastructure/notifications/notifier';

const button = 'btn';
const primary = 'btn btn-primary';

/** Turns browser notifications on or off for this device, and explains what they can and cannot do. */
export function NotificationsSection() {
  const { notifier } = useApp();
  const [permission, setPermission] = useState<NotificationSupport>(() => notifier.permission());
  const [enabled, setEnabled] = useState(getNotificationsEnabled);
  const [message, setMessage] = useState<string | null>(null);

  const on = enabled && permission === 'granted';

  async function turnOn() {
    setMessage(null);
    const result = permission === 'granted' ? 'granted' : await notifier.request();
    setPermission(result);
    if (result === 'granted') {
      setNotificationsEnabled(true);
      setEnabled(true);
    } else if (result === 'denied') {
      setMessage(
        'Notifications are blocked for this site. Allow them in your browser settings, then try again.',
      );
    }
  }

  function turnOff() {
    setNotificationsEnabled(false);
    setEnabled(false);
    setMessage(null);
  }

  async function test() {
    const shown = await notifier.show({
      title: 'Tend',
      body: 'This is how a reminder will look.',
      tag: 'tend-test',
    });
    setMessage(shown ? 'Test notification sent.' : 'The browser would not show a notification.');
  }

  return (
    <section aria-labelledby="notifications-heading" className="space-y-2">
      <h3 id="notifications-heading" className="text-lg font-medium">
        Notifications
      </h3>
      <p className="text-sm text-muted">
        Reminders always show on the Dashboard. Browser notifications are optional and are chosen
        per device.
      </p>

      {permission === 'unsupported' ? (
        <p className="text-sm text-muted">This browser cannot show notifications.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {on ? (
            <>
              <span role="status" className="text-sm text-ok">
                Browser notifications are on.
              </span>
              <button type="button" className={button} onClick={() => void test()}>
                Send a test
              </button>
              <button type="button" className={button} onClick={turnOff}>
                Turn off
              </button>
            </>
          ) : (
            <button type="button" className={primary} onClick={() => void turnOn()}>
              Turn on browser notifications
            </button>
          )}
        </div>
      )}

      {message ? (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      ) : null}

      <p className="text-sm text-muted">
        Limit: a notification appears while the app is open, including in a background tab, and
        anything that came due while it was closed appears when you open it. Nothing can wake a
        closed app until online push arrives in a later version.
      </p>
    </section>
  );
}
