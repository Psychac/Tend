import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

// Files are kept in the browser's private file system (OPFS), outside the database.
test('a file attached to an asset survives a reload and can be removed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/assets');
  await page.getByRole('button', { name: 'Add asset' }).click();
  await page.getByLabel('Name').fill('Water heater');
  await page.getByRole('button', { name: 'Save asset' }).click();
  await expect(page.getByText('Water heater')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Files for Water heater' }).click();
  const files = page.getByRole('region', { name: 'Files for Water heater' });
  await files.getByLabel('Add a file').setInputFiles({
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test invoice'),
  });
  await expect(files.getByText('invoice.pdf')).toBeVisible({ timeout: 30_000 });
  await expect(files.getByText('File missing on this device')).toHaveCount(0);

  // Still there, with its bytes, after a full reload.
  await page.waitForTimeout(1000);
  await page.reload();
  await page.getByRole('button', { name: 'Files for Water heater' }).click();
  const again = page.getByRole('region', { name: 'Files for Water heater' });
  await expect(again.getByText('invoice.pdf')).toBeVisible({ timeout: 30_000 });
  await expect(again.getByText('File missing on this device')).toHaveCount(0);

  // The stored bytes are the ones that went in.
  const stored = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('tend-attachments');
    const out: string[] = [];
    for await (const [, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      out.push(await (await (handle as FileSystemFileHandle).getFile()).text());
    }
    return out;
  });
  expect(stored).toEqual(['%PDF-1.4 test invoice']);

  // Opening shows it in a new tab.
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    again.getByRole('button', { name: 'Open invoice.pdf' }).click(),
  ]);
  await popup.close();

  // Removing takes the file out of storage as well as the list.
  await again.getByRole('button', { name: 'Remove invoice.pdf' }).click();
  await again.getByRole('button', { name: 'Confirm remove invoice.pdf' }).click();
  await expect(again.getByText('invoice.pdf')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('tend-attachments');
        const names: string[] = [];
        for await (const [name] of dir as unknown as AsyncIterable<[string, unknown]>) {
          names.push(name);
        }
        return names.length;
      }),
    )
    .toBe(0);

  expect(errors).toEqual([]);
});

test('a backup zip carries attached files to another device', async ({ browser }) => {
  const a = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await a.goto('/assets');
  await a.getByRole('button', { name: 'Add asset' }).click();
  await a.getByLabel('Name').fill('Water heater');
  await a.getByRole('button', { name: 'Save asset' }).click();
  await expect(a.getByText('Water heater')).toBeVisible({ timeout: 30_000 });
  await a.getByRole('button', { name: 'Files for Water heater' }).click();
  const files = a.getByRole('region', { name: 'Files for Water heater' });
  await files.getByLabel('Add a file').setInputFiles({
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 zip invoice'),
  });
  await expect(files.getByText('invoice.pdf')).toBeVisible({ timeout: 30_000 });

  await a.getByRole('link', { name: 'Settings' }).click();
  const downloading = a.waitForEvent('download');
  await a.getByRole('button', { name: /Download backup with files/ }).click();
  const path = await (await downloading).path();

  const b = await (await browser.newContext()).newPage();
  await b.goto('/settings');
  await b.getByLabel(/restore from a backup file/i).setInputFiles(path);
  await expect(b.getByText(/nothing has changed yet/i)).toBeVisible({ timeout: 30_000 });
  await b.getByRole('button', { name: 'Merge into my data' }).click();
  await expect(b.getByText(/1 attached file restored/)).toBeVisible({ timeout: 30_000 });

  await b.getByRole('link', { name: 'Assets' }).click();
  await b.getByRole('button', { name: 'Files for Water heater' }).click();
  const there = b.getByRole('region', { name: 'Files for Water heater' });
  await expect(there.getByText('invoice.pdf')).toBeVisible({ timeout: 30_000 });
  await expect(there.getByText('File missing on this device')).toHaveCount(0);
});
