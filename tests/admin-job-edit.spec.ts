import { test, expect } from '@playwright/test';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

test.describe('Admin Edit Job Flow', () => {
  test.beforeEach(async () => {
    // Reset and seed database before each test for isolation
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectDatabase();
  });

  test('should create a new job and successfully update its payment channel and status', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');

    // Wait for redirection and dashboard load
    await expect(page).toHaveURL('/admin');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Operational Dashboard')).toBeVisible();

    // 2. Navigate to "Jobs" tab
    await page.click('a[href="#jobs"]');
    await expect(page.locator('text=Show Completed')).toBeVisible();

    // 3. Create a new job
    await page.click('button:has-text("Create New Job")');
    await expect(page.locator('text=Create New Job')).toHaveCount(2); // Header + Title

    // Select Customer
    await page.fill('#customer-search', 'John Doe');
    const customerOption = page.locator('.absolute.z-50.w-full.mt-1 div:has-text("John Doe")').first();
    await expect(customerOption).toBeVisible();
    await customerOption.click({ force: true });

    // Change service to Walk-In (which matches the comment on line 53)
    await page.uncheck('label:has-text("Pickup") input[type="checkbox"]');
    await page.uncheck('label:has-text("Delivery") input[type="checkbox"]');
    await page.check('label:has-text("Walk-In") input[type="checkbox"]');

    // Select a Laundry Item (Polo Shirt)
    await page.check('text=Polo Shirt');

    // Set Payment Channel to Transfer and Status to Paid
    await page.selectOption('select#payment-channel', 'Transfer');
    await page.check('input[name="payment-status"] >> nth=1');

    // Save the job
    await page.click('button:has-text("Create Job")');
    await expect(page.locator('text=created')).toBeVisible({ timeout: 15000 });

    // Wait for the modal to close and the list/Kanban board to refresh
    await expect(page.locator('#customer-search')).not.toBeVisible();

    // 4. Open the job again (should be in Billing/In Shop status since walk-in)
    // Let's filter to "In Shop / Processing" or find the card
    const walkInCard = page.locator('div[data-status="billing"] div.cursor-pointer').filter({ hasText: 'John Doe' }).first();
    await walkInCard.click();
    await expect(page.locator('text=Edit Job')).toBeVisible();

    // Verify payment fields are saved
    const paymentChannelSelect = page.locator('select#payment-channel');
    await expect(paymentChannelSelect).toHaveValue('Transfer');
    await expect(page.locator('input[name="payment-status"]:checked + span')).toHaveText('Paid');

    // 5. Update payment channel to Cash / COD and status to Unpaid
    await page.selectOption('select#payment-channel', 'Cash / COD');
    await page.check('input[name="payment-status"] >> nth=0');
    
    // Save changes
    await page.click('button:has-text("Save Changes")');
    await expect(page.locator('text=Job updated successfully!').first()).toBeVisible();
    await expect(page.locator('#customer-search')).not.toBeVisible();

    // 6. Open the job again to verify the update saved
    await walkInCard.click();
    await expect(page.locator('text=Edit Job')).toBeVisible();
    await expect(page.locator('select#payment-channel')).toHaveValue('Cash / COD');
    await expect(page.locator('input[name="payment-status"]:checked + span')).toHaveText('Unpaid');

    // 7. Test Process Substatus -> Ready
    await page.click('button:has-text("Ready")');
    await page.click('button:has-text("Save Changes")');
    await expect(page.locator('text=Job updated successfully!').first()).toBeVisible();
    await expect(page.locator('#customer-search')).not.toBeVisible();

    // Verify it is visible on the Jobs page
    await expect(page.locator('text=John Doe').first()).toBeVisible();
  });
});
