import { expect, test, type Page } from '@playwright/test';

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL;
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD;

if (!demoEmail || !demoPassword) {
  throw new Error('PLAYWRIGHT_DEMO_EMAIL and PLAYWRIGHT_DEMO_PASSWORD are required for the container smoke suite.');
}

async function signIn(page: Page, baseUrl?: string) {
  await page.goto(baseUrl ? `${baseUrl}/` : '/');
  await page.getByLabel('Email').fill(demoEmail!);
  await page.getByLabel('Password').fill(demoPassword!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/timeline$/);
}

test('an authenticated save is visible to a fresh session after cache invalidation', async ({ browser, page }) => {
  test.setTimeout(120_000);
  const marker = `Container cache smoke ${Date.now()}`;
  let detailUrl: string | undefined;
  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();

  try {
    await signIn(page);

    // Prime the server-side timeline cache before the mutation.
    await page.goto('/timeline');
    await page.goto('/timeline/new');
    await page.getByLabel('Journal Note').fill(marker);
    await page.getByRole('button', { name: 'Save entry' }).click();
    await expect(page).toHaveURL(/\/timeline(?:\?.*)?$/);

    const createdEntry = page.getByRole('link', { name: new RegExp(marker) });
    await expect(createdEntry).toBeVisible();
    await createdEntry.click();
    await expect(page).toHaveURL(/\/timeline\/[^/]+$/);
    detailUrl = page.url();

    const origin = new URL(page.url()).origin;
    await signIn(secondPage, origin);
    await secondPage.goto(`${origin}/timeline`);
    await expect(secondPage.getByRole('link', { name: new RegExp(marker) })).toBeVisible();
  } finally {
    await secondContext.close();
    if (detailUrl) {
      await page.goto(detailUrl);
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page).toHaveURL(/\/timeline$/);
    }
  }
});
