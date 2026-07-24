import { test, expect } from '@playwright/test';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

test.describe('POS Walk-in Creation Flow', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectDatabase();
  });

  test('should create a walk-in POS job and verify it appears in the jobs list', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');

    await expect(page).toHaveURL('/admin');

    // 2. Click the POS tab
    await page.click('a[href="#pos"]');
    await expect(page.locator('text=Point of Sale')).toBeVisible();

    // 3. Select the customer John Doe
    await page.selectOption('aside select', { label: 'John Doe' });
    await expect(page.locator('p.text-indigo-900:has-text("John Doe")')).toBeVisible();
    await expect(page.locator('text=0898765432')).toBeVisible();

    // 4. Click a product in the grid to add to cart
    await page.click('text=Standard Wash & Fold');
    await page.click('text=Polo Shirt');

    // Verify items in the cart
    await expect(page.locator('text=2 items')).toBeVisible();
    await expect(page.locator('text=Standard Wash & Fold').nth(1)).toBeVisible();
    await expect(page.locator('text=Polo Shirt').nth(1)).toBeVisible();

    // 5. Click checkout
    await page.click('button:has-text("Record Sale & Sync")');

    // Wait for success toast
    await expect(page.locator('text=Order Synced Successfully')).toBeVisible();

    // 6. Verify job is listed in the Jobs list
    await page.click('a[href="#jobs"]');
    await expect(page.locator('text=John Doe').first()).toBeVisible();
  });
});
