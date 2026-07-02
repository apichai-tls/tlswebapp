import { test, expect } from '@playwright/test';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

test.describe('Admin Settings Commission Flow', () => {
  test.beforeEach(async () => {
    // Reset and seed database before each test for isolation
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectDatabase();
  });

  test('should successfully update rider commission rate and persist it after reload', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');

    // Wait for redirection and dashboard load
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('text=Operational Dashboard')).toBeVisible();

    // 2. Navigate to "Settings" tab
    await page.click('a[href="#settings"]');
    await expect(page.locator('text=Rider Commission Settings')).toBeVisible();

    // 3. Verify initial state defaults or is editable
    const commissionInput = page.locator('input#rider-commission-input');
    await expect(commissionInput).toBeVisible();
    
    // Clear and fill new value
    await commissionInput.click();
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Backspace');
    await commissionInput.fill('4.5');

    // 4. Click Save
    await page.click('button#save-commission-btn');
    
    // Wait for success toast
    await expect(page.locator('text=Rider Commission Rate updated successfully')).toBeVisible();

    // 5. Reload the page to verify persistence
    await page.reload();
    await expect(page).toHaveURL(/\/admin/);

    // 6. Navigate back to "Settings" tab if hash was lost, otherwise it should still be active
    if (!page.url().endsWith('#settings')) {
      await page.click('a[href="#settings"]');
    }
    await expect(page.locator('text=Rider Commission Settings')).toBeVisible();

    // 7. Verify the input retains the saved value (4.5) and didn't bounce back
    await expect(page.locator('input#rider-commission-input')).toHaveValue('4.5');
  });
});
