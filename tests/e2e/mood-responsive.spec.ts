import { expect, test } from '@playwright/test';

const demoEmail = process.env.PLAYWRIGHT_DEMO_EMAIL;
const demoPassword = process.env.PLAYWRIGHT_DEMO_PASSWORD;

if (!demoEmail || !demoPassword) {
  throw new Error('PLAYWRIGHT_DEMO_EMAIL and PLAYWRIGHT_DEMO_PASSWORD are required for the configured smoke suite.');
}

test('edge mood selections stay inside the selector on narrow phones', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(demoEmail);
  await page.getByLabel('Password').fill(demoPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/timeline$/);

  for (const width of [320, 360, 375, 390, 412, 430]) {
    await page.setViewportSize({ width, height: 852 });
    await page.goto('/timeline/new');
    const selector = page.locator('.aero-mood-selector');
    await expect(selector).toBeVisible();

    for (const mood of ['Awful', 'Rad']) {
      await page.getByRole('button', { name: `Select ${mood} mood` }).click();
      const geometry = await selector.evaluate((element) => {
        const selectorRect = element.getBoundingClientRect();
        const buttonRects = [...element.querySelectorAll('button')].map((button) => {
          const rect = button.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        });
        return {
          left: selectorRect.left,
          right: selectorRect.right,
          buttonRects,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });

      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      for (const rect of geometry.buttonRects) {
        expect(rect.left).toBeGreaterThanOrEqual(geometry.left);
        expect(rect.right).toBeLessThanOrEqual(geometry.right);
      }
    }
  }
});
