import { test, expect } from '@playwright/test';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

test.describe('Admin Reopen Completed Job Flow', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectDatabase();
  });

  test('should drag a completed job to Delivery status, enter reason in dialog, and verify it updates and registers in Admin Notes', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');

    // Wait for redirection and dashboard load
    await expect(page).toHaveURL('/admin');
    await expect(page.locator('text=Operational Dashboard')).toBeVisible();

    // 2. Navigate to "Jobs" tab
    await page.click('a[href="#jobs"]');
    await expect(page.locator('text=Show Completed')).toBeVisible();

    // 3. Check "Show Completed" to show the Completed column and job card
    await page.locator('label:has-text("Show Completed") input[type="checkbox"]').check();

    // Verify the completed job (#2026001099) card is visible in the Completed column
    const completedCard = page.locator('div.cursor-pointer').filter({ hasText: '#2026001099' }).first();
    await expect(completedCard).toBeVisible();

    // 4. Drag card from Completed column to Delivery column
    const deliveryColumn = page.locator('div[data-status="delivery"]');
    await completedCard.dragTo(deliveryColumn);

    // 5. Verify the "Reopen Job" dialog is shown
    await expect(page.locator('text=Reopen Job')).toBeVisible();

    // Verify "Confirm Reopen" button is disabled initially
    const confirmButton = page.locator('#confirm-reopen-btn');
    await expect(confirmButton).toBeDisabled();

    // Fill in the reason
    await page.fill('#reopen-reason-input', 'Need to redeliver laundry due to client request');
    await expect(confirmButton).not.toBeDisabled();

    // Click confirm
    await confirmButton.click();

    // Verify toast success
    await expect(page.locator('text=Job updated to Delivery').first()).toBeVisible();

    // 6. Verify job card has moved from Completed to Delivery
    const deliveryCard = page.locator('div.cursor-pointer').filter({ hasText: '#2026001099' }).first();
    await expect(deliveryCard).toBeVisible();

    // 7. Click on the card to open Edit Job Dialog
    await deliveryCard.click();
    await expect(page.locator('text=Edit Job')).toBeVisible();

    // Verify the reason is logged in the Admin Note Logs section
    const logsSection = page.locator('text=Reopened Job: Status changed from Completed to Delivery. Reason: Need to redeliver laundry due to client request');
    await expect(logsSection).toBeVisible();
  });
});
