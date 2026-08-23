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

async function verifyTimelineFlow(page: Page) {
  await signIn(page);

  const cards = timelineCards(page);
  await expect(cards).toHaveCount(25);
  await expect(cards.first().locator('p').first()).toBeVisible();
  await expect(cards.first().locator('time')).toBeVisible();

  const firstCard = cards.first();
  await firstCard.click();
  await expect(page).toHaveURL(/\/timeline\/(?!new$)[^/]+$/);
  await expect(page.locator('h1').first()).toBeVisible();

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(cards.first()).toBeVisible();
  await cards.first().click();
  await expect(page).toHaveURL(/\/timeline\/(?!new$)[^/]+$/);

  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.resourceType() === 'document') documentRequests += 1;
  });
  const requestsBeforeNavigation = documentRequests;
  const navigationStartedAt = Date.now();
  await page.getByRole('link', { name: 'Timeline', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(cards.first()).toBeVisible();
  test.info().annotations.push({
    type: 'timeline-navigation-ms',
    description: String(Date.now() - navigationStartedAt),
  });
  expect(documentRequests).toBe(requestsBeforeNavigation);

  const initialCount = await cards.count();
  const loadOlder = page.getByRole('button', { name: 'Load older entries', exact: true });
  await expect(loadOlder).toBeVisible();
  await loadOlder.click();
  await expect.poll(() => cards.count()).toBe(initialCount + 25);

  await page.goto('/timeline?activity=not-a-real-activity');
  await expect(page.getByText('No matching memories yet.')).toBeVisible();
  await page.getByRole('link', { name: 'View all entries', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(cards.first()).toBeVisible();

  const iconHref = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(iconHref).toBeTruthy();
  const iconResponse = await page.request.get(new URL(iconHref!, page.url()).toString());
  expect(iconResponse.ok()).toBeTruthy();
}

test.describe('timeline polish desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('uses cached client navigation and 25-entry pages', async ({ page }) => {
    await verifyTimelineFlow(page);
  });
});

test.describe('timeline polish mobile', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('keeps notes primary and layout deterministic', async ({ page }) => {
    await verifyTimelineFlow(page);

    const activities = page.getByLabel('Activities').first();
    if (await activities.count()) {
      const tops = await activities.locator('[role="img"]').evaluateAll((pills) =>
        new Set(pills.map((pill) => Math.round(pill.getBoundingClientRect().top))).size,
      );
      expect(tops).toBeLessThanOrEqual(2);
    }

    for (const width of [320, 360, 393, 412]) {
      await page.setViewportSize({ width, height: 915 });
      await page.goto('/timeline/new');
      const form = page.locator('form.aero-entry-form');
      await expect(form).toBeVisible();
      await expect(page.getByRole('button', { name: /Select .* mood/ })).toHaveCount(5);
      await expect(page.getByRole('button', { name: 'Select Rad mood' })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText('Journal note', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(1);

      const metrics = await page.evaluate(() => {
        const action = document.querySelector('.aero-action-bar')?.getBoundingClientRect();
        const dock = document.querySelector('.aero-dock');
        const dockRect = dock?.getBoundingClientRect();
        const moodButtons = [...document.querySelectorAll('section[aria-labelledby="mood-heading"] button')]
          .map((button) => button.getBoundingClientRect());
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          actionBottom: action?.bottom ?? 0,
          dockTop: dockRect?.top ?? window.innerHeight,
          dockPosition: dock ? getComputedStyle(dock).position : null,
          smallestMoodButton: Math.min(...moodButtons.map((button) => Math.min(button.width, button.height))),
        };
      });

      expect(metrics.documentWidth).toBe(metrics.viewportWidth);
      expect(metrics.smallestMoodButton).toBeGreaterThanOrEqual(44);
      expect(metrics.actionBottom).toBeLessThanOrEqual(metrics.dockTop);
      expect(metrics.dockPosition).toBe('fixed');
      await page.getByRole('heading', { name: 'Activities', exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByLabel('Entry actions')).toBeVisible();
    }

    for (const width of [393, 412]) {
      await page.setViewportSize({ width, height: 915 });
      await page.goto('/calendar');
      const calendarMetrics = await page.evaluate(() => {
        const scroll = document.querySelector('.calendar-grid-scroll');
        const inner = document.querySelector('.calendar-grid-inner');
        const saturday = document.querySelector('.calendar-grid-inner > .grid:last-child > :nth-child(7)');
        if (!scroll || !inner || !saturday) return null;
        const scrollRect = scroll.getBoundingClientRect();
        const innerRect = inner.getBoundingClientRect();
        const saturdayRect = saturday.getBoundingClientRect();
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          innerWidth: innerRect.width,
          scrollWidth: scroll.scrollWidth,
          scrollClientWidth: scroll.clientWidth,
          saturdayVisible: saturdayRect.left >= scrollRect.left && saturdayRect.right <= scrollRect.right,
        };
      });
      expect(calendarMetrics).not.toBeNull();
      expect(calendarMetrics?.documentWidth).toBe(calendarMetrics?.viewportWidth);
      expect(calendarMetrics?.innerWidth).toBeLessThanOrEqual(calendarMetrics?.scrollClientWidth ?? 0);
      expect(calendarMetrics?.scrollWidth).toBe(calendarMetrics?.scrollClientWidth);
      expect(calendarMetrics?.saturdayVisible).toBe(true);
    }

    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/insights');
    await expect(page.getByText('entries this month', { exact: true })).toBeVisible();
    await expect(page.getByText('compared with last month', { exact: true })).toHaveCount(0);

    for (const [route, selector] of [
      ['/timeline', 'main a[href^="/timeline/"]:not([href="/timeline/new"])'],
      ['/insights', 'section[aria-labelledby="top-activities-heading"]'],
      ['/activities', 'section[aria-labelledby="activities-list-heading"]'],
    ] as const) {
      await page.goto(route);
      const safeAtScrollEnd = await page.evaluate((targetSelector) => {
        const root = document.querySelector('.aero-screen-content');
        const dock = document.querySelector('.aero-dock');
        const target = document.querySelector(targetSelector);
        if (!root || !dock || !target) return false;
        root.scrollTop = root.scrollHeight;
        const dockRect = dock.getBoundingClientRect();
        return target.getBoundingClientRect().bottom <= dockRect.top;
      }, selector);
      expect(safeAtScrollEnd).toBe(true);
    }
  });
});
