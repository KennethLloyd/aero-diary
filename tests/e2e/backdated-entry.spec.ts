import { expect, test } from '@playwright/test';

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL;
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD;

if (!demoEmail || !demoPassword) {
  throw new Error('PLAYWRIGHT_DEMO_EMAIL and PLAYWRIGHT_DEMO_PASSWORD are required for the configured smoke suite.');
}

test('demo user can save an entry for yesterday', async ({ page }) => {
  const marker = `Automated backdated entry ${Date.now()}`;
  const { today, yesterday } = await page.evaluate(() => {
    const format = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part) => String(part).padStart(2, '0'))
      .join('-');
    const todayDate = new Date();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    return { today: format(todayDate), yesterday: format(yesterdayDate) };
  });

  await page.goto('/');
  await page.getByLabel('Email').fill(demoEmail);
  await page.getByLabel('Password').fill(demoPassword);
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
      date.setDate(date.getDate() - 1);
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(date);
    }),
  );

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
});
