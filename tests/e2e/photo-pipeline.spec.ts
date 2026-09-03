import { expect, test } from '@playwright/test';
import path from 'node:path';

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL;
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD;

if (!demoEmail || !demoPassword) {
  throw new Error('PLAYWRIGHT_DEMO_EMAIL and PLAYWRIGHT_DEMO_PASSWORD are required for the configured smoke suite.');
}

test('photo attachments cover empty, partial, and full capacity on mobile and desktop', async ({ page }) => {
  test.setTimeout(900_000);
  const fixture = path.resolve('public/icon-192x192.png');
  const viewports = [
    { name: 'mobile', width: 393, height: 852 },
    { name: 'desktop', width: 1280, height: 900 },
  ];
  const photoCounts = [0, 1, 3, 20];

  await page.goto('/');
  await page.getByLabel('Email').fill(demoEmail);
  await page.getByLabel('Password').fill(demoPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/timeline$/);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const photoCount of photoCounts) {
      const marker = `Photo pipeline ${viewport.name} ${photoCount} ${Date.now()}`;
      let detailUrl: string | undefined;
      try {
        await page.goto('/timeline/new');
        await page.getByLabel('Journal Note').fill(marker);
        if (photoCount > 0) {
          await page.locator('input[type="file"]').setInputFiles(
            Array.from({ length: photoCount }, () => fixture),
          );
        }

        await expect(page.getByText(`${photoCount} of 20 photos`)).toBeVisible({ timeout: 120_000 });
        if (photoCount === 20) {
          await expect(page.getByRole('button', { name: 'Add more photos' })).not.toBeVisible();
        }
        await expect(page.getByRole('button', { name: 'Save entry' })).toBeEnabled();
        await page.getByRole('button', { name: 'Save entry' }).click();
        await expect(page).toHaveURL(/\/timeline$/);

        const createdEntry = page.getByRole('link', { name: new RegExp(marker) });
        await expect(createdEntry).toBeVisible();
        await createdEntry.click();
        await expect(page).toHaveURL(/\/timeline\/[^/]+$/);
        detailUrl = page.url();
        await expect(page.getByRole('heading', { name: 'Good' })).toBeVisible();
        if (photoCount > 0) {
          await expect(page.getByRole('button', { name: 'View photo 1' })).toBeVisible();
          await expect(page.getByRole('button', { name: `View photo ${photoCount}` })).toBeVisible();
          await page.getByRole('button', { name: 'View photo 1' }).click();
          const viewer = page.getByRole('dialog');
          const dock = page.locator('.aero-dock');
          await expect(viewer).toBeVisible();
          await expect(dock).toHaveAttribute('aria-hidden', 'true');
          await expect(dock).toHaveAttribute('inert', '');
          await page.keyboard.press('Escape');
          await expect(viewer).not.toBeVisible();
          await expect(dock).not.toHaveAttribute('aria-hidden');
          await expect(dock).not.toHaveAttribute('inert');
          await expect(page.getByRole('button', { name: 'View photo 1' })).toBeFocused();
        }
        await page.getByRole('link', { name: 'Edit' }).click();
        await expect(page).toHaveURL(/\/timeline\/[^/]+\/edit$/);
        await expect(page.getByText(`${photoCount} of 20 photos`)).toBeVisible();
        if (photoCount > 0) {
          await expect(page.getByRole('img', { name: 'Attached photo 1' })).toBeVisible();
        }
        if (photoCount === 20) {
          await expect(page.getByRole('button', { name: 'Add more photos' })).not.toBeVisible();
        }
        if (photoCount === 1) {
          page.once('dialog', (dialog) => dialog.accept());
          await page.getByRole('button', { name: 'Remove attached photo 1' }).click();
          await expect(page.getByText('0 of 20 photos')).toBeVisible();
          await page.locator('input[type="file"]').setInputFiles(fixture);
          await expect(page.getByText('1 of 20 photos')).toBeVisible({ timeout: 120_000 });
          await expect(page.getByRole('button', { name: 'Save entry' })).toBeEnabled();
          await page.getByRole('button', { name: 'Save entry' }).click();
          await expect(page).toHaveURL(detailUrl);
        } else {
          await page.goBack();
          await expect(page).toHaveURL(detailUrl);
        }
      } finally {
        if (detailUrl) {
          await page.goto(detailUrl);
          await page.getByRole('button', { name: 'Delete', exact: true }).click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
          await expect(page).toHaveURL(/\/timeline$/);
        }
      }
    }
  }
});
