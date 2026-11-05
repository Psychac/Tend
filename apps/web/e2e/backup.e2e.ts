import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('a backup downloaded on one device restores on another', async ({ browser }) => {
  // Device A: create an activity and download a backup.
  const a = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await a.goto('/activities/new');
  await a.getByLabel('Name').fill('Service boiler');
  await a.getByRole('button', { name: 'Create activity' }).click();
  await expect(a.getByText('Service boiler')).toBeVisible({ timeout: 30_000 });

  await a.getByRole('link', { name: 'Settings' }).click();
  const downloading = a.waitForEvent('download');
  await a.getByRole('button', { name: 'Download backup' }).click();
  const path = await (await downloading).path();
  expect(JSON.parse(readFileSync(path, 'utf8')).counts.activities).toBe(1);

  // Device B: a fresh browser profile with no data restores it.
  const b = await (await browser.newContext()).newPage();
  await b.goto('/settings');
  await b.getByLabel(/restore from a backup file/i).setInputFiles(path);
  await expect(b.getByText(/nothing has changed yet/i)).toBeVisible({ timeout: 30_000 });
  await b.getByRole('button', { name: 'Merge into my data' }).click();
  await expect(b.getByText('Backup restored.')).toBeVisible();

  await b.getByRole('link', { name: 'Activities' }).click();
  await expect(b.getByText('Service boiler')).toBeVisible();
});
