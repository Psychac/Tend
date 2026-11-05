import { expect, test } from '@playwright/test';

test('a completion can be corrected and then undone, and it survives a reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/activities/new');
  await page.getByLabel('Name').fill('Service boiler');
  await page.getByLabel('Repeats').selectOption('calendar');
  await page.getByLabel('Unit').selectOption('day');
  await page.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByText('Service boiler')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('link', { name: 'Dashboard' }).click();
  const dueToday = page.getByRole('region', { name: 'Due today' });
  await dueToday.getByRole('button', { name: 'Details' }).click();
  await dueToday.getByLabel('Notes').fill('first draft');
  await dueToday.getByLabel('Cost', { exact: true }).fill('99');
  await dueToday.getByRole('button', { name: 'Save and mark done' }).click();
  await expect(page.getByRole('region', { name: 'Recently done' })).toBeVisible();

  // Correct it: the old values are filled in; change the notes and currency.
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Edit Service boiler' }).click();
  const form = page.getByRole('form', { name: 'Edit entry for Service boiler' });
  await expect(form.getByLabel('Notes')).toHaveValue('first draft');
  await form.getByLabel('Notes').fill('final notes');
  await form.getByLabel('Cost currency').selectOption('USD');
  await form.getByRole('button', { name: 'Save changes' }).click();

  const entry = page.getByRole('listitem');
  await expect(entry).toContainText('final notes');
  await expect(entry).toContainText('$99.00');
  await expect(entry).toContainText('(edited)');
  await expect(page.getByRole('listitem')).toHaveCount(1);

  // The correction is stored, not just shown.
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByRole('listitem')).toContainText('final notes');

  // Undo it: gone from history, due again.
  await page.getByRole('button', { name: 'Undo Service boiler' }).click();
  await page.getByRole('button', { name: 'Yes, undo it' }).click();
  await expect(page.getByText(/nothing has been done yet/i)).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(
    page.getByRole('region', { name: 'Due today' }).getByText('Service boiler'),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
