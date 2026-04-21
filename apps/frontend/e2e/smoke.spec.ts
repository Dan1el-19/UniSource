import { expect, test } from '@playwright/test';

test('landing exposes one primary auth CTA', async ({ page }) => {
  await page.goto('/');

  const cta = page.getByRole('link', { name: /zaloguj (się|sie)|przejd(ź|z) do dysku/i });
  await expect(cta).toBeVisible();

  const ctaCount = await page.locator('main a').count();
  expect(ctaCount).toBe(1);

  await cta.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /Witaj ponownie/i })).toBeVisible();
  await expect(page.locator('form button[type="submit"]')).toBeVisible();
});

test('settings page redirects guests to login', async ({ page }) => {
  await page.goto('/settings');

  await expect(page).toHaveURL(/\/login\?redirect=.*settings/i);
  await expect(page.getByRole('heading', { name: /Witaj ponownie/i })).toBeVisible();
});
