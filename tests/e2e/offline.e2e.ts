import { expect, test } from '@playwright/test';

test('data created in the app survives a reload and can be completed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/activities/new');
  await page.getByLabel('Name').fill('Water plants');
  await page.getByLabel('Repeats').selectOption('calendar');
  await page.getByLabel(/^Unit/).selectOption('day');
  await page.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByText('Water plants')).toBeVisible({ timeout: 30_000 });

  // Stored on the device: still there after a full reload.
  await page.reload();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  const dueToday = page.getByRole('region', { name: 'Due today' });
  await expect(dueToday.getByText('Water plants')).toBeVisible({ timeout: 30_000 });

  await dueToday.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('region', { name: 'Recently done' })).toContainText('Water plants');

  // The completion is stored too.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Recently done' })).toContainText('Water plants', {
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});

// MVP criterion 7: once loaded, the app must start with no network. The service worker precaches the
// app shell and the SQLite WASM files.
test('the app starts with no network once loaded', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30_000 });
  // Wait until the service worker controls the page, i.e. the precache is complete.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30_000 });
});
