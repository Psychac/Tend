import { expect, test } from '@playwright/test';

// The browsers used for automated tests refuse notification permission, so the browser side is
// replaced here: permission is "granted" and anything shown through the service worker is
// recorded in localStorage. Everything else (the engine, what is delivered, never twice) is real.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const record = (title: string, body?: string) => {
      const shown = JSON.parse(localStorage.getItem('e2e.shown') ?? '[]') as unknown[];
      shown.push({ title, body });
      localStorage.setItem('e2e.shown', JSON.stringify(shown));
    };
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: Object.assign(function Notification() {}, {
        permission: 'granted',
        requestPermission: async () => 'granted',
      }),
    });
    ServiceWorkerRegistration.prototype.showNotification = async function (
      title: string,
      options?: NotificationOptions,
    ) {
      record(title, options?.body);
    };
  });
});

const shown = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('e2e.shown') ?? '[]') as unknown[]);

test('a due reminder is delivered to the browser once, and shown on the dashboard', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Notifications are shown through the service worker, so wait for it to be in charge.
  await page.goto('/settings');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await page.getByRole('button', { name: 'Turn on browser notifications' }).click();
  await expect(page.getByText('Browser notifications are on.')).toBeVisible({ timeout: 30_000 });

  // A daily activity with a reminder at the start of the day: due, and already fired.
  await page.getByRole('link', { name: 'Activities' }).click();
  await page.getByRole('link', { name: 'New activity' }).click();
  await page.getByLabel('Name').fill('Water plants');
  await page.getByLabel('Repeats').selectOption('calendar');
  await page.getByLabel(/^Unit/).selectOption('day');
  await page.getByRole('checkbox', { name: 'Remind me' }).click();
  await page.getByLabel('At', { exact: true }).fill('00:00');
  await page.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByText('Water plants')).toBeVisible();

  // The dashboard shows it straight away...
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('region', { name: /Reminders \(1\)/ })).toBeVisible();

  // ...and the browser is asked to show it when the app next starts.
  await page.reload();
  await expect
    .poll(() => shown(page), { timeout: 30_000 })
    .toEqual([{ title: 'Water plants', body: 'Due today' }]);

  // Reopening the app does not show it a second time: the delivery was remembered on disk.
  // (A pause first: a reload within milliseconds of a write can drop it, a known limit of the
  // on-device database. A person cannot reload that fast.)
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.getByRole('region', { name: /Reminders \(1\)/ })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);
  expect(await shown(page)).toHaveLength(1);

  expect(errors).toEqual([]);
});

test('nothing is delivered while this device has not opted in', async ({ page }) => {
  await page.goto('/activities/new');
  await page.getByLabel('Name').fill('Water plants');
  await page.getByLabel('Repeats').selectOption('calendar');
  await page.getByLabel(/^Unit/).selectOption('day');
  await page.getByRole('checkbox', { name: 'Remind me' }).click();
  await page.getByLabel('At', { exact: true }).fill('00:00');
  await page.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByText('Water plants')).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('region', { name: /Reminders \(1\)/ })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1500);
  expect(await shown(page)).toEqual([]);
});
