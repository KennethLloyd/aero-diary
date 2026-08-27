import { expect, test, type Page } from '@playwright/test';

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL;
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD;

if (!demoEmail || !demoPassword) {
  throw new Error('PLAYWRIGHT_DEMO_EMAIL and PLAYWRIGHT_DEMO_PASSWORD are required for the configured smoke suite.');
}

async function verifyBackdatedEntry(page: Page) {
  const marker = `Automated backdated entry ${Date.now()}`;
  const { today, yesterday, month } = await page.evaluate(() => {
    const format = (date: Date) => [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
      .map((part) => String(part).padStart(2, '0'))
      .join('-');
    const todayDate = new Date();
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    return {
      today: format(todayDate),
      yesterday: format(yesterdayDate),
      month: format(yesterdayDate).slice(0, 7),
    };
  });

  await page.goto('/');
  await page.getByLabel('Email').fill(demoEmail!);
  await page.getByLabel('Password').fill(demoPassword!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/timeline$/);

  await page.goto('/timeline/new');
  const dateChange = page.locator('.aero-date-change');
  const dateChangeBox = await dateChange.boundingBox();
  expect(dateChangeBox).not.toBeNull();
  const centerHit = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return target instanceof HTMLInputElement ? target.id : target?.closest('.aero-date-change')?.className;
  }, {
    x: dateChangeBox!.x + dateChangeBox!.width / 2,
    y: dateChangeBox!.y + dateChangeBox!.height / 2,
  });
  expect(centerHit).not.toBe('journal-date');
  await page.mouse.click(
    dateChangeBox!.x + dateChangeBox!.width / 2,
    dateChangeBox!.y + dateChangeBox!.height / 2,
  );
  await expect(page.locator('#journal-date')).toBeFocused();

  await expect(page.locator('#journal-date')).toHaveValue(today);
  await page.locator('#journal-date').fill(yesterday);
  await page.getByLabel('Journal Note').fill(marker);
  await page.getByRole('button', { name: 'Save entry' }).click();

  await expect(page).toHaveURL(/\/timeline$/);
  const createdEntry = page.getByRole('link', { name: new RegExp(`Mood:.*${marker}`, 'i') });
  await expect(createdEntry).toBeVisible();
  await createdEntry.click();
  await expect(page).toHaveURL(/\/timeline\/[^/]+$/);
  await expect(page.getByText(marker)).toBeVisible();

  const detailDate = page.locator('time').first();
  await expect(detailDate).toContainText(
    await page.evaluate(() => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - 1);
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    }),
  );

  const updatedMarker = `${marker} edited`;
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page).toHaveURL(/\/timeline\/[^/]+\/edit$/);
  await page.getByLabel('Journal Note').fill(updatedMarker);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/\/timeline\/[^/]+$/);
  await expect(page.getByText(updatedMarker)).toBeVisible();

  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Journal Note')).toHaveValue(updatedMarker);
  await page.getByRole('link', { name: 'Back to timeline without saving' }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  const updatedEntry = page.getByRole('link', { name: new RegExp(`Mood:.*${updatedMarker}`, 'i') });
  await expect(updatedEntry).toBeVisible();

  const updatedEntryHref = await updatedEntry.getAttribute('href');
  expect(updatedEntryHref).toMatch(/^\/timeline\/[^/]+$/);

  await page.goto(`/calendar?month=${month}`);
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.locator(`[aria-label*="${yesterday}"]`)).toBeVisible();

  await page.goto(`/insights?month=${month}`);
  await expect(page.getByRole('heading', { name: 'Insights', exact: true })).toBeVisible();
  await expect(page.locator('[aria-label="Monthly insight summary"]')).toContainText('memories logged');

  await page.goto(updatedEntryHref!);
  await expect(page).toHaveURL(/\/timeline\/[^/]+$/);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
}

test.describe('backdated entry', () => {
  test('demo user can save an entry for yesterday', async ({ page }) => {
    await verifyBackdatedEntry(page);
  });

  test.describe('mobile', () => {
    test.use({ viewport: { width: 393, height: 852 } });

    test('demo user can save an entry for yesterday', async ({ page }) => {
      await verifyBackdatedEntry(page);
    });
  });
});
