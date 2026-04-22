import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://mocked.appwrite.test/v1/account**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.pathname.endsWith('/account')) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized', message: 'No session' }),
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'NotFound', message: 'Unhandled Appwrite mock route' }),
    });
  });
});

test('root redirects guests to login', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /Witaj ponownie/i })).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toBeVisible();
});

test('settings page redirects guests to login', async ({ page }) => {
  await page.goto('/settings');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /Witaj ponownie/i })).toBeVisible();
});
