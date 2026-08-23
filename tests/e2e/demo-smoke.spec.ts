import { expect, test } from '@playwright/test';

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL;
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD;

if (!demoEmail || !demoPassword) {
  throw new Error('PLAYWRIGHT_DEMO_EMAIL and PLAYWRIGHT_DEMO_PASSWORD are required for the configured smoke suite.');
}

test('demo user can create, polish, view, and delete an entry', async ({ page }) => {
  let detailUrl: string | undefined;
  const marker = `Automated smoke entry ${Date.now()}`;

  await page.goto('/');
  await page.getByLabel('Email').fill(demoEmail);
  await page.getByLabel('Password').fill(demoPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(page.getByRole('heading', { name: 'Aero Diary', exact: true }).first()).toBeVisible();

  await page.goto('/');
  await expect(page).toHaveURL(/\/timeline$/);

  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();

  try {
    await page.goto('/timeline/new');
    await page.getByRole('button', { name: 'Select Rad mood' }).click();
    await page.getByLabel('Note').fill(marker);
    await page.getByRole('button', { name: 'Polish ✨' }).click();
    await expect(page.getByRole('button', { name: 'Show original' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page).toHaveURL(/\/timeline$/);
    const createdEntry = page.getByRole('link', { name: new RegExp(`Mood: RAD.*${marker}`) });
    await expect(createdEntry).toBeVisible();
    await createdEntry.click();
    await expect(page).toHaveURL(/\/timeline\/(?!new$)[^/]+$/);
    detailUrl = page.url();
    await expect(page.getByRole('heading', { name: 'Rad' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
  } finally {
    if (detailUrl) {
      await page.goto(detailUrl);
      const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
      await expect(deleteButton).toBeVisible();
      await deleteButton.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page).toHaveURL(/\/timeline$/);
    }
  }
});
