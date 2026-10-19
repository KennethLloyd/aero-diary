import { expect, test, type Page, type BrowserContext } from '@playwright/test';

const email = process.env.PLAYWRIGHT_AERO_AI_EMAIL;
const password = process.env.PLAYWRIGHT_AERO_AI_PASSWORD;
const thread = {
  id: 'cmvesix210002mui5ft1krf7y',
  title: 'A fictional saved conversation',
  updatedAt: new Date().toISOString(),
  isGenerating: false,
};
const turns = Array.from({ length: 12 }, (_, index) => ({
  id: `turn-${index}`,
  clientRequestId: `request-${index}`,
  sequence: index + 1,
  userContent: `A moment to remember ${index + 1}`,
  assistantContent: `## Reflection ${index + 1}\n\nA **small moment** worth remembering.\n\n- A quiet walk\n- Time to reflect\n\n[October 18, 2026](/timeline/cmvesix1g0001mui50113ncc4)`,
  status: 'COMPLETE',
}));

function completedReply(content = 'A fresh **reply**.') {
  return `event: delta\ndata: ${JSON.stringify({ content })}\n\nevent: done\ndata: ${JSON.stringify({ turnId: 'completed', title: thread.title, assistantContent: content })}\n\n`;
}

async function mockSavedChats(page: Page) {
  await page.route('**/api/aero-ai/threads', async (route) => route.fulfill({ json: [thread] }));
  await page.route(`**/api/aero-ai/threads/${thread.id}`, async (route) =>
    route.fulfill({ json: { ...thread, turns } }),
  );
}

test.describe('Aero AI chat experience', () => {
  test.skip(
    !email || !password,
    'Requires an isolated private review account; demo accounts cannot use Aero AI.',
  );

  let authCookies: Awaited<ReturnType<BrowserContext['cookies']>> = [];
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(process.env.PLAYWRIGHT_BASE_URL!);
    await page.getByLabel('Email', { exact: true }).fill(email!);
    await page.getByLabel('Password', { exact: true }).fill(password!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/timeline$/);
    authCookies = await context.cookies();
    await context.close();
  });

  test.beforeEach(async ({ page, context }) => {
    await context.addCookies(authCookies);
    await mockSavedChats(page);
  });

  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 393, height: 852 },
    { width: 320, height: 720 },
  ]) {
    test(`comfortable typing and history at ${viewport.width}px`, async ({ page }) => {
      await page.route('**/messages', async (route) =>
        route.fulfill({ contentType: 'text/event-stream', body: completedReply() }),
      );
      await page.setViewportSize(viewport);
      await page.goto('/aero-ai');
      const composer = page.getByRole('textbox', { name: 'Message Aero AI', exact: true });
      await expect(composer).toBeEnabled();
      const messages = page.getByRole('region', { name: 'Messages', exact: true });
      await expect
        .poll(() => messages.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight))
        .toBeLessThan(2);
      const headerTop = await page
        .getByRole('heading', { name: thread.title, exact: true })
        .evaluate((node) => node.getBoundingClientRect().top);
      await composer.fill('First line\nSecond line\nThird line');
      expect(
        await composer.evaluate(
          (node: HTMLTextAreaElement) =>
            node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight,
        ),
      ).toBe(true);
      await composer.fill('A long draft that wraps naturally. '.repeat(80));
      const geometry = await composer.evaluate((node) => ({
        height: node.clientHeight,
        scroll: node.scrollHeight,
        width: node.clientWidth,
        scrollWidth: node.scrollWidth,
        overflow: getComputedStyle(node).overflowY,
      }));
      expect(geometry.height).toBeLessThanOrEqual(184);
      expect(geometry.scroll).toBeGreaterThan(geometry.height);
      expect(geometry.overflow).toBe('auto');
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
      await composer.fill('x'.repeat(350));
      expect(await composer.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(
        await page
          .getByRole('heading', { name: thread.title, exact: true })
          .evaluate((node) => node.getBoundingClientRect().top),
      ).toBe(headerTop);

      if (viewport.width < 768) {
        await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
        await composer.fill('A mobile thought');
        await composer.press('End');
        await composer.press('Enter');
        expect(await composer.inputValue()).toBe('A mobile thought\n');
        await page.getByRole('button', { name: 'Send message' }).click();
        await expect(page.getByText('A fresh reply.', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Open chat history' }).click();
        const drawer = page.getByRole('dialog', { name: 'Conversations' });
        await expect(drawer).toBeVisible();
        await drawer.getByRole('searchbox').fill('no matching conversation');
        await expect(drawer.getByText('No conversations match your search.')).toBeVisible();
        await drawer.getByRole('searchbox').fill('fictional');
        await expect(drawer.getByRole('button', { name: thread.title })).toBeVisible();
        await drawer.getByRole('button', { name: thread.title }).click();
        await expect(drawer).not.toBeVisible();
        await page.getByRole('button', { name: 'Open chat history' }).click();
        await page.keyboard.press('Escape');
        await expect(drawer).not.toBeVisible();
        await expect(page.getByRole('button', { name: 'Open chat history' })).toBeFocused();
      } else {
        await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
        await page.getByRole('searchbox', { name: 'Search conversations' }).fill('absent');
        await expect(page.getByText('No conversations match your search.')).toBeVisible();
      }
    });
  }

  test('keeps a reader in place when a reply arrives and can jump to the latest', async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/messages', async (route) => {
      await pending;
      await route.fulfill({
        contentType: 'text/event-stream',
        body: completedReply('A fresh streamed reply.'),
      });
    });
    await page.goto('/aero-ai');
    const composer = page.getByRole('textbox', { name: 'Message Aero AI', exact: true });
    await expect(composer).toBeEnabled();
    await composer.fill('A new thought');
    await composer.press('Enter');
    await expect(page.getByRole('button', { name: 'Stop reply' })).toBeVisible();
    const messages = page.getByRole('region', { name: 'Messages', exact: true });
    await messages.hover();
    await page.mouse.wheel(0, -900);
    await expect(page.getByRole('button', { name: 'Jump to latest', exact: false })).toBeVisible();
    const oldTop = await messages.evaluate((node) => node.scrollTop);
    release();
    await expect(page.getByRole('button', { name: 'Stop reply' })).toHaveCount(0);
    expect(await messages.evaluate((node) => node.scrollTop)).toBeCloseTo(oldTop, 0);
    await page.getByRole('button', { name: 'Jump to latest', exact: false }).click();
    await expect
      .poll(() => messages.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight))
      .toBeLessThan(2);
    await expect(page.getByText('A fresh streamed reply.')).toBeVisible();
  });

  test('retries failures with the original request and confirms deletion', async ({ page }) => {
    const requests: Array<{ requestId: string; content: string }> = [];
    await page.route('**/messages', async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill(
        requests.length === 1
          ? { status: 503, json: { error: 'Temporary review failure' } }
          : { contentType: 'text/event-stream', body: completedReply() },
      );
    });
    await page.goto('/aero-ai');
    const composer = page.getByRole('textbox', { name: 'Message Aero AI', exact: true });
    await expect(composer).toBeEnabled();
    await composer.fill('Please keep this thought');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText('Temporary review failure')).toBeVisible();
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByText('A fresh reply.', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await page.getByLabel('Chat options', { exact: true }).click();
    await page.getByRole('button', { name: 'Delete chat', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Delete chat?' });
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toHaveCount(0);
    let deleted = false;
    await page.route(`**/api/aero-ai/threads/${thread.id}`, async (route) => {
      deleted = route.request().method() === 'DELETE';
      await route.fulfill({ json: { deleted: true } });
    });
    await page.getByLabel('Chat options', { exact: true }).click();
    await page.getByRole('button', { name: 'Delete chat', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Delete chat', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'What’s on your mind?' })).toBeVisible();
    expect(deleted).toBe(true);
  });
});
