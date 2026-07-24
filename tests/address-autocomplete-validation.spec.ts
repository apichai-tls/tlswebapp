import { test, expect } from '@playwright/test';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

test.describe('Address Autocomplete Selection Validation', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('💻 BROWSER LOG:', msg.text()));
    page.on('pageerror', err => console.error('🔴 BROWSER ERROR:', err.message));
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectDatabase();
  });

  test('Scenario 1: Typing manual address without selecting suggestion should show warning and block saving', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');

    // Wait for redirection and dashboard load
    await expect(page).toHaveURL('/admin');
    await page.waitForLoadState('networkidle');

    // 2. Navigate to "Jobs" tab and open "Create New Job" dialog
    await page.click('a[href="#jobs"]');
    await page.click('button:has-text("Create New Job")');
    await expect(page.locator('text=Create New Job')).toHaveCount(2);

    // 3. Select Customer
    await page.fill('#customer-search', 'John Doe');
    const customerOption = page.locator('.absolute.z-50.w-full.mt-1 div:has-text("John Doe")').first();
    await expect(customerOption).toBeVisible();
    await customerOption.click({ force: true });

    // 4. Type address manually without clicking dropdown suggestion
    await page.fill('#pickup-location', 'The Davis Bangkok Hotel');

    // 5. Verify the warning text is rendered below the input box
    const warningLocator = page.locator('text=กรุณาเลือกที่อยู่จากรายการแนะนำเพื่อระบุพิกัด');
    await expect(warningLocator).toBeVisible();

    // 6. Try to save the job, verify saving is blocked and toast shows warning
    await page.click('button:has-text("Create Job")');
    
    // Toast notification error should appear
    await expect(page.locator('text=กรุณาเลือกที่อยู่ขารับจากรายการแนะนำของ Google Maps')).toBeVisible();

    // Confirm that the dialog remains open
    await expect(page.locator('#pickup-location')).toBeVisible();
  });

  test('Scenario 2: Selecting autocomplete suggestion should clear warning and allow saving', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');
    await expect(page).toHaveURL('/admin');
    await page.waitForLoadState('networkidle');

    // 2. Navigate and open dialog
    await page.click('a[href="#jobs"]');
    await page.click('button:has-text("Create New Job")');

    // 3. Select Customer
    await page.fill('#customer-search', 'John Doe');
    const customerOption = page.locator('.absolute.z-50.w-full.mt-1 div:has-text("John Doe")').first();
    await customerOption.click({ force: true });

    // Select Laundry Item
    await page.check('text=Polo Shirt');

    // 4. Type address and select from suggestion
    await page.fill('#pickup-location', 'The Davis Bangkok');
    await page.waitForTimeout(1500); // Wait for debounce (500ms) + API fetch to settle
    const firstSuggestion = page.locator('ul li').first();
    await expect(firstSuggestion).toBeVisible({ timeout: 15000 });
    await firstSuggestion.click({ force: true });

    const warningLocator = page.locator('text=กรุณาเลือกที่อยู่จากรายการแนะนำเพื่อระบุพิกัด');
    await expect(warningLocator).not.toBeVisible({ timeout: 15000 });

    // 6. Save job successfully
    await page.click('button:has-text("Create Job")');
    await expect(page.locator('text=created')).toBeVisible({ timeout: 15000 });

    // Confirm dialog is closed
    await expect(page.locator('#pickup-location')).not.toBeVisible({ timeout: 15000 });
  });
});
