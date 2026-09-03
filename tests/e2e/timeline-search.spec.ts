import { expect, test, type Page } from '@playwright/test';

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL;
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD;

if (!demoEmail || !demoPassword) {
  throw new Error('PLAYWRIGHT_DEMO_EMAIL and PLAYWRIGHT_DEMO_PASSWORD are required for the configured smoke suite.');
}

const timelineCards = (page: Page) => page.locator('main a[href^="/timeline/"]:not([href="/timeline/new"])');

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(demoEmail!);
  await page.getByLabel('Password').fill(demoPassword!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/timeline$/);
}

async function submitSearch(page: Page, query: string) {
  const form = page.getByRole('form', { name: 'Search timeline' });
  await form.getByLabel('Search your notes').fill(query);
  await form.getByRole('button', { name: 'Search' }).click();
  return form;
}

test.describe('timeline search desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('searches notes across cursor pages and keeps deep-link filters', async ({ page }) => {
    await signIn(page);

    await submitSearch(page, 'a');
    await expect(page).toHaveURL(/\/timeline\?q=a$/);
    await expect(page.getByText('Search results for “a”', { exact: true })).toBeVisible();
    await expect(timelineCards(page)).toHaveCount(25);
    await expect(page.locator('mark').first()).toBeVisible();

    const firstCardHref = await timelineCards(page).first().getAttribute('href');
    expect(firstCardHref).toMatch(/^\/timeline\//);
    await page.getByRole('button', { name: 'Load older memories', exact: true }).click();
    await expect(timelineCards(page)).toHaveCount(50);

    await page.goto('/timeline?mood=GOOD');
    await expect(page.getByText('Filtered memories', { exact: true })).toBeVisible();
    await submitSearch(page, 'a');
    await expect(page).toHaveURL(/\/timeline\?q=a&mood=GOOD$/);
    await expect(page.getByText('Search results for “a”', { exact: true })).toBeVisible();
    await expect(page.locator('[aria-label="Mood: Good"]')).toHaveCount(await timelineCards(page).count());

    await submitSearch(page, 'phrase-that-is-not-in-this-journal');
    await expect(page.getByRole('heading', { name: 'No matching memories found' })).toBeVisible();
    await expect(page.getByText('Try a different phrase or return to your full memory timeline.')).toBeVisible();
  });

  test('treats empty and overlong URL queries as inactive search', async ({ page }) => {
    await signIn(page);

    await page.goto('/timeline?q=%20%20');
    await expect(timelineCards(page)).toHaveCount(25);
    await expect(page.getByLabel('Search your notes')).toHaveValue('');

    await page.goto(`/timeline?q=${'x'.repeat(201)}`);
    await expect(timelineCards(page)).toHaveCount(25);
    await expect(page.getByLabel('Search your notes')).toHaveValue('');
  });
});

test.describe('timeline search mobile', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('keeps the search form and highlighted results inside the viewport', async ({ page }) => {
    await signIn(page);
    await submitSearch(page, 'a');

    await expect(page).toHaveURL(/\/timeline\?q=a$/);
    await expect(page.locator('mark').first()).toBeVisible();
    const metrics = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(metrics.documentWidth).toBe(metrics.viewportWidth);
  });
});
