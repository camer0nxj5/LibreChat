import { expect, test } from '@playwright/test';
import { NEW_CHAT_PATH, selectModelSpec, sendMessage, mockReply } from './helpers';

for (const enabled of [true, false]) {
  test(`preserves saved Google Tools ${enabled} after reloading a spec conversation`, async ({ page }) => {
    await page.goto(NEW_CHAT_PATH);
    await selectModelSpec(page, 'E2E Icon Spec');
    await sendMessage(page, 'Google state restoration fixture');
    await expect(mockReply(page)).toBeVisible();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop()!;
    await page.evaluate(({ id, enabled }) => {
      const key = `lastGoogleToolsToggle_${id}`;
      localStorage.setItem(key, JSON.stringify(enabled));
      localStorage.setItem(`${key}_TIMESTAMP`, String(Date.now()));
      localStorage.setItem('lastGoogleToolsToggle_pinned', 'true');
    }, { id, enabled });
    await page.reload();
    const checkbox = page.getByRole('checkbox', { name: 'Google Tools', exact: true });
    await expect(checkbox).toBeVisible();
    if (enabled) await expect(checkbox).toBeChecked();
    else await expect(checkbox).not.toBeChecked();
    let resolveBody!: (body: { ephemeralAgent?: { google_tools?: boolean; mcp?: string[] } }) => void;
    const bodyPromise = new Promise<{ ephemeralAgent?: { google_tools?: boolean; mcp?: string[] } }>((resolve) => { resolveBody = resolve; });
    await page.route('**/api/agents/chat/**', async (route) => {
      if (route.request().method() !== 'POST' || route.request().url().endsWith('/abort')) return route.continue();
      resolveBody(route.request().postDataJSON());
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Stopped by diagnostic test before tool execution' }) });
    });
    await page.getByTestId('text-input').fill('Read my budget spreadsheet');
    await page.getByTestId('send-button').click();
    const body = await bodyPromise;
    expect(body.ephemeralAgent?.google_tools).toBe(enabled);
    expect(body.ephemeralAgent?.mcp?.includes('CJ-Google-Tools') ?? false).toBe(enabled);
  });
}
