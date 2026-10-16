import { expect, test } from '@playwright/test';
import { withMongo } from '../specs/mock/db';

const choices = [
  ['Continue with Local', 'gpt-4o-mini'],
  ['Fireworks fixture', 'gpt-4o'],
  ['ChatGPT fixture', 'gpt-4.1'],
] as const;

for (const [label, expectedModel] of choices) {
  test(`holds the ask, runs ${label}, and preserves the local default`, async ({ page }) => {
    const starts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/agents/chat/')) {
        starts.push(request.url());
      }
    });
    if (label === 'Continue with Local') {
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await page.goto('/c/new');
    const input = page.getByTestId('text-input');
    await input.fill('Fix this Python code 😀: print(1)');
    await page.getByTestId('send-button').click();
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    expect(starts).toHaveLength(0);
    await expect(input).toHaveValue('Fix this Python code 😀: print(1)');
    if (label === 'Continue with Local') {
      await page.screenshot({ path: 'e2e/specs/.test-results/cj-routing-mobile.png' });
    } else if (label === 'Fireworks fixture') {
      await page.screenshot({ path: 'e2e/specs/.test-results/cj-routing-desktop.png' });
    }
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(
      page.locator('.message-render').filter({ hasText: 'E2E mock reply: pong' }),
    ).toBeVisible();
    await page.waitForURL(
      (url) => url.pathname.startsWith('/c/') && !url.pathname.endsWith('/new'),
    );
    const conversationId = page.url().split('/').pop();
    await expect
      .poll(async () =>
        withMongo(async (db) => {
          const conversation = await db.collection('conversations').findOne({ conversationId });
          const reply = await db
            .collection('messages')
            .findOne({ conversationId, isCreatedByUser: false });
          return { savedModel: conversation?.model, replyModel: reply?.model };
        }),
      )
      .toEqual({ savedModel: 'gpt-4o-mini', replyModel: expectedModel });
    expect(starts).toHaveLength(1);
  });
}

test('web research does not show a routing card', async ({ page }) => {
  await page.goto('/c/new');
  await page.getByTestId('text-input').fill('Research flights on the web');
  await page.getByTestId('send-button').click();
  await expect(
    page.locator('.message-render').filter({ hasText: 'E2E mock reply: pong' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Local', exact: true })).toHaveCount(
    0,
  );
});

test('Google Sheets reading/writing offers the three choices and can be cancelled', async ({
  page,
}) => {
  await page.goto('/c/new');
  await page.getByTestId('text-input').fill('Read my Google Sheets budget and sum expenses');
  await page.getByTestId('send-button').click();
  await expect(
    page.getByText(/This ask appears to involve Google Sheets reading\/writing/),
  ).toBeVisible();
  for (const [label] of choices) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('text-input')).toHaveValue(
    'Read my Google Sheets budget and sum expenses',
  );
});
