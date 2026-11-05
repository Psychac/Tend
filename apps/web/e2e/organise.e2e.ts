import { expect, test } from '@playwright/test';

test('categories and places can be created, used and survive a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/settings');
  const category = page.getByRole('form', { name: 'Add category' });
  await category.getByLabel('New category').fill('Cleaning');
  await category.getByRole('button', { name: 'Add category' }).click();
  await expect(page.getByRole('button', { name: 'Rename Cleaning' })).toBeVisible({
    timeout: 30_000,
  });

  const place = page.getByRole('form', { name: 'Add place' });
  await place.getByLabel('New place').fill('House');
  await place.getByRole('button', { name: 'Add place' }).click();
  await expect(page.getByRole('button', { name: 'Edit House' })).toBeVisible();
  await place.getByLabel('New place').fill('Kitchen');
  await place.getByLabel('Inside').selectOption({ label: 'House' });
  await place.getByRole('button', { name: 'Add place' }).click();
  await expect(page.getByRole('button', { name: 'Edit Kitchen' })).toBeVisible();

  await page.getByRole('link', { name: 'Activities' }).click();
  await page.getByRole('link', { name: 'New activity' }).click();
  await page.getByLabel('Name').fill('Wipe counters');
  await page.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Cleaning' });
  await page.getByRole('combobox', { name: 'Place' }).selectOption({ label: 'House › Kitchen' });
  await page.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByText(/Cleaning · House › Kitchen/)).toBeVisible();

  // Stored on the device: still there, and still linked, after a reload.
  await page.reload();
  await expect(page.getByText(/Cleaning · House › Kitchen/)).toBeVisible({ timeout: 30_000 });

  // In use, so deleting the category is refused.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Delete Cleaning' }).click();
  await expect(page.getByRole('alert')).toContainText(/used by 1 activity/);

  expect(errors).toEqual([]);
});
