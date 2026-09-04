import { expect, test, type Page } from '@playwright/test';

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL;
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD;

if (!demoEmail || !demoPassword) {
  throw new Error('PLAYWRIGHT_DEMO_EMAIL and PLAYWRIGHT_DEMO_PASSWORD are required for the configured smoke suite.');
}

const timelineCards = (page: Page) => page.locator('main a[href^="/timeline/"]:not([href="/timeline/new"])');

const dockLayoutRoutes = [
  { route: '/timeline', target: 'main a[href^="/timeline/"]:not([href="/timeline/new"])' },
  { route: '/calendar', target: 'main > section[aria-labelledby="calendar-heading"] > :last-child' },
  { route: '/insights', target: 'main > section[aria-labelledby="top-activities-heading"] a:last-of-type' },
  {
    route: '/activities',
    target: 'main > div > section:last-of-type :is(li:last-child, form button[type="submit"])',
  },
  { route: '/settings', target: 'main > div > section:last-of-type form button[type="submit"]' },
] as const;

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(demoEmail!);
  await page.getByLabel('Password').fill(demoPassword!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/timeline$/);
}

async function verifyFloatingDock(page: Page, route: string, targetSelector: string) {
  await page.goto(route);
  await expect(page.locator(targetSelector).last()).toBeVisible();
  const dock = page.locator('.aero-dock');
  await expect(dock).toBeVisible();

  async function readMetrics() {
    return page.evaluate(async (selector) => {
      const screen = document.querySelector<HTMLElement>('.aero-screen');
      const root = document.querySelector<HTMLElement>('.aero-screen-content');
      const dockElement = document.querySelector<HTMLElement>('.aero-dock');
      if (!screen || !root || !dockElement) return null;

      const initialDockTop = dockElement.getBoundingClientRect().top;
      root.scrollTop = Math.max(0, Math.floor((root.scrollHeight - root.clientHeight) / 2));
      const scrolledDockTop = dockElement.getBoundingClientRect().top;
      root.scrollTop = root.scrollHeight;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const targets = document.querySelectorAll<HTMLElement>(selector);
      const target = targets.item(targets.length - 1);
      if (!target) return null;

      const screenRect = screen.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const dockRect = dockElement.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      return {
        dockPosition: getComputedStyle(dockElement).position,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        screenHeight: screenRect.height,
        rootHeight: rootRect.height,
        rootScrollHeight: root.scrollHeight,
        rootClientHeight: root.clientHeight,
        dockCenterOffset: Math.abs((dockRect.left + dockRect.right) / 2 - window.innerWidth / 2),
        dockBottomGap: window.innerHeight - dockRect.bottom,
        dockTopDeltaWhileScrolling: Math.abs(scrolledDockTop - initialDockTop),
        targetCount: targets.length,
        targetTop: targetRect.top,
        targetBottom: targetRect.bottom,
        dockTop: dockRect.top,
        targetInScrollViewport:
          targetRect.top >= rootRect.top - 1 && targetRect.bottom <= rootRect.bottom + 1,
        targetAboveDock: targetRect.bottom <= dockRect.top + 1,
      };
    }, targetSelector);
  }

  let previousLayoutSignature: string | undefined;
  let stableLayoutSamples = 0;
  await expect.poll(
    async () => {
      const metrics = await readMetrics();
      const layoutSignature = metrics
        ? [
          metrics.targetCount,
          metrics.rootScrollHeight,
          Math.round(metrics.targetTop),
          Math.round(metrics.targetBottom),
        ].join(':')
        : '';
      stableLayoutSamples = layoutSignature && layoutSignature === previousLayoutSignature
        ? stableLayoutSamples + 1
        : 0;
      previousLayoutSignature = layoutSignature;
      return Boolean(metrics?.targetInScrollViewport && metrics?.targetAboveDock && stableLayoutSamples >= 1);
    },
    {
      timeout: 15_000,
      intervals: [100, 250, 500],
      message: `Expected the final ${route} target to settle above the floating dock in the scroll viewport`,
    },
  ).toBe(true);

  const metrics = await readMetrics();

  expect(metrics).not.toBeNull();
  expect(metrics?.dockPosition).toBe('fixed');
  expect(metrics?.documentWidth).toBeLessThanOrEqual(metrics?.viewportWidth ?? 0);
  expect(metrics?.rootHeight).toBeCloseTo(metrics?.screenHeight ?? 0, 0);
  expect(metrics?.rootScrollHeight).toBeGreaterThanOrEqual(metrics?.rootClientHeight ?? 0);
  expect(metrics?.dockCenterOffset).toBeLessThanOrEqual(1);
  expect(metrics?.dockBottomGap).toBeGreaterThanOrEqual(0);
  expect(metrics?.dockTopDeltaWhileScrolling).toBeLessThanOrEqual(1);
  expect(metrics?.targetInScrollViewport).toBe(true);
  expect(metrics?.targetAboveDock).toBe(true);
}

async function verifyTimelineFlow(page: Page) {
  await signIn(page);

  await expect.poll(() => page.locator('.aero-dock').evaluate((dock) => getComputedStyle(dock).position)).toBe('fixed');

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
  const loadOlder = page.getByRole('button', { name: 'Load older memories', exact: true });
  await expect(loadOlder).toBeVisible();
  await loadOlder.click();
  await expect.poll(() => cards.count()).toBe(initialCount + 25);

  await page.goto('/timeline?activity=not-a-real-activity');
  await expect(page.getByRole('heading', { name: 'No matching memories found' })).toBeVisible();
  await page.getByRole('link', { name: 'View all memories', exact: true }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(cards.first()).toBeVisible();

  const iconHref = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(iconHref).toBeTruthy();
  const iconResponse = await page.request.get(new URL(iconHref!, page.url()).toString());
  expect(iconResponse.ok()).toBeTruthy();
  const appleIconHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(appleIconHref).toBe('/icon-512-maskable.png');
  const appleIconResponse = await page.request.get(new URL(appleIconHref!, page.url()).toString());
  expect(appleIconResponse.ok()).toBeTruthy();

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('/manifest.webmanifest');
  const manifestResponse = await page.request.get(new URL(manifestHref!, page.url()).toString());
  expect(manifestResponse.ok()).toBeTruthy();
  expect(await manifestResponse.json()).toMatchObject({
    display: 'standalone',
    theme_color: '#69a7e1',
    background_color: '#69a7e1',
  });
}

test.describe('timeline polish desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('uses cached client navigation and 25-entry pages', async ({ page }) => {
    await verifyTimelineFlow(page);
  });
  test('shows a new entry immediately after the create redirect', async ({ page }) => {
    await signIn(page);

    const uniqueNote = `Read-your-writes ${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.goto('/timeline/new');
    await page.getByLabel('Journal Note').fill(uniqueNote);
    await page.getByRole('button', { name: 'Save entry' }).click();

    await expect(page).toHaveURL(/\/timeline$/);
    await expect(page.getByText(uniqueNote, { exact: true })).toBeVisible();
  });

  test('keeps the shared dock fixed and content clear across responsive layouts', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page);

    for (const viewport of [
      { width: 393, height: 852 },
      { width: 639, height: 852 },
      { width: 640, height: 852 },
      { width: 768, height: 900 },
      { width: 1280, height: 600 },
      { width: 1280, height: 900 },
      { width: 2560, height: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      for (const { route, target } of dockLayoutRoutes) {
        await verifyFloatingDock(page, route, target);
      }
    }
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

    for (const width of [360, 390, 412, 430]) {
      await page.setViewportSize({ width, height: 915 });
      await page.goto('/timeline/new');
      const form = page.locator('#entry-form');
      await expect(form).toBeVisible();
      await expect(page.getByRole('button', { name: /Select .* mood/ })).toHaveCount(5);
      await expect(page.getByRole('button', { name: 'Select Good mood' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: 'Select Rad mood' }).click();
      await expect(page.getByRole('button', { name: 'Select Rad mood' })).toHaveAttribute('aria-pressed', 'true');
      await expect(form.locator('.activity-chip')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Activities' })).toHaveCount(0);
      await expect(page.getByText('Journal Note', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save entry' })).toHaveCount(1);

      const metrics = await page.evaluate(() => {
        const save = document.querySelector('[data-entry-save-sentinel]');
        const dock = document.querySelector('.aero-dock');
        const moodButtons = [...document.querySelectorAll('section[aria-labelledby="mood-heading"] button')]
          .map((button) => button.getBoundingClientRect());
        return {
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          saveInForm: save?.closest('form')?.id === 'entry-form',
          actionBar: Boolean(document.querySelector('.aero-action-bar')),
          dockPosition: dock ? getComputedStyle(dock).position : null,
          smallestMoodButton: Math.min(...moodButtons.map((button) => Math.min(button.width, button.height))),
          activityChipCount: document.querySelectorAll('#entry-form .activity-chip').length,
          polishFontSize: Number.parseFloat(
            [...document.querySelectorAll('button')]
              .find((button) => button.textContent?.includes('Polish writing'))
              ?.ownerDocument.defaultView?.getComputedStyle(
                [...document.querySelectorAll('button')]
                  .find((button) => button.textContent?.includes('Polish writing'))!,
              ).fontSize ?? '0',
          ),
        };
      });

      expect(metrics.documentWidth).toBe(metrics.viewportWidth);
      expect(metrics.saveInForm).toBe(true);
      expect(metrics.actionBar).toBe(false);
      expect(metrics.activityChipCount).toBe(0);
      expect(metrics.smallestMoodButton).toBeGreaterThanOrEqual(44);
      expect(metrics.dockPosition).toBe('fixed');
      await expect.poll(() => page.locator('.aero-dock').evaluate((dock) => getComputedStyle(dock).visibility)).toBe('visible');

      await page.locator('[data-entry-save-sentinel]').scrollIntoViewIfNeeded();
      await expect.poll(() => page.locator('.aero-dock').evaluate((dock) => getComputedStyle(dock).visibility)).toBe('hidden');

      await page.evaluate(() => {
        document.querySelector<HTMLElement>('[data-entry-save-sentinel]')?.scrollIntoView({ block: 'start' });
      });
      await expect.poll(() => page.locator('.aero-dock').evaluate((dock) => getComputedStyle(dock).visibility)).toBe('visible');
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
    await expect(page.getByText(/memories logged/).first()).toBeVisible();

    for (const [route, selector] of [
      ['/timeline', 'main a[href^="/timeline/"]:not([href="/timeline/new"])'],
      ['/insights', 'section[aria-labelledby="top-activities-heading"]'],
      ['/activities', 'section[aria-labelledby="activities-list-heading"]'],
      ['/settings', 'section[aria-labelledby="settings-management-heading"]'],
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
