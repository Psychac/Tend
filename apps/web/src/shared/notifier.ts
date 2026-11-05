import type { ReminderItem } from '@upkeep/application';

/** 'unsupported' where the browser has no Notification API at all. */
export type NotificationSupport = 'unsupported' | NotificationPermission;

export interface NotificationContent {
  readonly title: string;
  readonly body: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  readonly tag: string;
}

/** Delivery of a notification to the person. Replaceable in tests. */
export interface Notifier {
  permission(): NotificationSupport;
  request(): Promise<NotificationSupport>;
  /** True if the notification was shown. */
  show(content: NotificationContent): Promise<boolean>;
}

const hasApi = (): boolean => typeof Notification !== 'undefined';

/**
 * Browser notifications. Shown through the service worker when there is one, because
 * that is the only way mobile browsers show them; otherwise directly from the page.
 */
export const browserNotifier: Notifier = {
  permission: () => (hasApi() ? Notification.permission : 'unsupported'),

  async request() {
    if (!hasApi()) return 'unsupported';
    return Notification.requestPermission();
  },

  async show({ title, body, tag }) {
    if (!hasApi() || Notification.permission !== 'granted') return false;
    const options: NotificationOptions = {
      body,
      tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    };
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) {
        await registration.showNotification(title, options);
      } else {
        new Notification(title, options);
      }
      return true;
    } catch {
      return false;
    }
  },
};

// ---------------------------------------------------------------- per-device choice

const KEY = 'upkeep.browserNotifications';

/** Whether this device should show browser notifications. A per-device choice, off until asked for. */
export function getNotificationsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setNotificationsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0');
  } catch {
    // Not remembered; it applies until the page closes.
  }
}

// ---------------------------------------------------------------- wording

/** "due today", "due in 3 days", "2 days overdue" */
export function dueText(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'due today';
  if (daysUntilDue === 1) return 'due tomorrow';
  if (daysUntilDue > 1) return `due in ${daysUntilDue} days`;
  const late = -daysUntilDue;
  return `${late} day${late === 1 ? '' : 's'} overdue`;
}

/** One notification for however many reminders came due together. */
export function describeReminders(items: readonly ReminderItem[]): NotificationContent {
  const [only] = items;
  if (items.length === 1 && only) {
    return {
      title: only.activity.name,
      body: `${dueText(only.daysUntilDue)[0]?.toUpperCase()}${dueText(only.daysUntilDue).slice(1)}`,
      tag: 'upkeep-reminders',
    };
  }
  const names = items.slice(0, 4).map((i) => i.activity.name);
  const more = items.length - names.length;
  return {
    title: `${items.length} things need attention`,
    body: names.join(', ') + (more > 0 ? ` and ${more} more` : ''),
    tag: 'upkeep-reminders',
  };
}
