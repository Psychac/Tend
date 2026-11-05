import { expect, test } from '@playwright/test';

test('the app opens its on-device database in a real browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);

  // SQLite WASM must have created real browser storage for the database file.
  const storage = await page.evaluate(async () => {
    const names: string[] = [];
    const root = await navigator.storage.getDirectory();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const [name] of (root as any).entries()) names.push(name);
    const idb = (await indexedDB.databases()).map((d) => d.name ?? '');
    return [...names, ...idb];
  });
  expect(storage.some((n) => n.includes('tend'))).toBe(true);

  // It must also survive a reload and open again.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
