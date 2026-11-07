import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

// Two tabs of one browser profile share one database (PowerSync's shared worker).
test('a change in one tab appears in the other without a reload', async ({ context }) => {
  const errors: string[] = [];
  const a = await context.newPage();
  const b = await context.newPage();
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(e.message));

  await a.goto('/activities/new');
  await b.goto('/');
  await expect(b.getByText('What do you want to keep up?')).toBeVisible({ timeout: 30_000 });

  await a.getByLabel('Name').fill('Water plants');
  await a.getByLabel('Repeats').selectOption('calendar');
  await a.getByLabel(/^Unit/).selectOption('day');
  await a.getByRole('button', { name: 'Create activity' }).click();
  await expect(a.getByText('Water plants')).toBeVisible({ timeout: 30_000 });

  // Tab B was never reloaded or touched.
  await expect(b.getByRole('region', { name: 'Due today' })).toBeVisible({ timeout: 30_000 });
  await expect(b.getByText('Water plants').first()).toBeVisible();

  // Completing it in B shows in A.
  await b.getByRole('region', { name: 'Due today' }).getByRole('button', { name: 'Done' }).click();
  await a.getByRole('link', { name: 'Dashboard' }).click();
  await expect(a.getByText('Recently done')).toBeVisible({ timeout: 30_000 });

  expect(errors).toEqual([]);
});

test('two tabs deliver a due reminder once', async ({ context }) => {
  await context.addInitScript(() => {
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
  const a = await context.newPage();
  await a.goto('/settings');
  await a.evaluate(() => navigator.serviceWorker.ready);
  await a.reload();
  await a.getByRole('button', { name: 'Turn on browser notifications' }).click();
  await expect(a.getByText('Browser notifications are on.')).toBeVisible({ timeout: 30_000 });

  await a.getByRole('link', { name: 'Activities' }).click();
  await a.getByRole('link', { name: 'New activity' }).click();
  await a.getByLabel('Name').fill('Water plants');
  await a.getByLabel('Repeats').selectOption('calendar');
  await a.getByLabel(/^Unit/).selectOption('day');
  await a.getByRole('checkbox', { name: 'Remind me' }).click();
  await a.getByLabel('At', { exact: true }).fill('00:00');
  await a.getByRole('button', { name: 'Create activity' }).click();
  await expect(a.getByText('Water plants')).toBeVisible({ timeout: 30_000 });
  await a.waitForTimeout(1000);

  // Open a second tab at the same moment as the first reloads: both run their startup checks.
  const b = await context.newPage();
  await Promise.all([a.goto('/'), b.goto('/')]);
  await expect(a.getByRole('region', { name: /Reminders \(1\)/ })).toBeVisible({ timeout: 30_000 });
  await b.waitForTimeout(3000);

  const shown = await a.evaluate(
    () => JSON.parse(localStorage.getItem('e2e.shown') ?? '[]') as unknown[],
  );
  expect(shown).toEqual([{ title: 'Water plants', body: 'Due today' }]);
});
