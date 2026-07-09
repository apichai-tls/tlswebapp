import { test, expect } from '@playwright/test';

test('has title and navigates to admin dashboard', async ({ page }) => {
  // Navigate to the landing page
  await page.goto('/');

  // Expect page to contain heading "Rider Management System"
  const heading = page.getByRole('heading', { name: 'Rider Management System' });
  await expect(heading).toBeVisible();

  // Click the Admin Dashboard button
  await page.getByRole('button', { name: 'Admin Dashboard' }).click();

  // Expect navigation to either /admin or /login (due to auth redirects)
  await expect(page).toHaveURL(/.*(admin|login)/);
});
