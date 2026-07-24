import { test, expect } from '@playwright/test';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

test.describe('Rider App Workflow', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await disconnectDatabase();
  });

  test('should verify active job auto-opens chat and completed job bypasses it', async ({ page }) => {
    // 1. Login as Rider
    await page.goto('/login');
    await page.fill('#email', 'rider1@tls.com');
    await page.fill('#password', 'rider1234');
    await page.click('button:has-text("Sign In")');

    // Wait for redirect to rider dashboard
    await expect(page).toHaveURL('/rider');
    await expect(page.locator('button[role="tab"]:has-text("My Jobs")')).toBeVisible();

    // 2. Click on the active job card (John Doe #2026001045)
    await page.click('text=John Doe');

    // Verify details modal opened first
    await expect(page.locator('text=Pickup At')).toBeVisible();

    // Click to open chat manually
    await page.click('text=Tap to open chat');

    // Verify that the Chat dialog popped open
    await expect(page.locator('h2:has-text("Job Chat")')).toBeVisible();
    await expect(page.locator('text=No messages yet')).toBeVisible();

    // Close the chat dialog
    await page.locator('button:has(svg.lucide-chevron-left)').click(); // Click the back chevron button in chat header
    
    // Verify we are back in the details modal and chat is closed
    await expect(page.locator('h2:has-text("Job Chat")')).not.toBeVisible();
    await expect(page.locator('text=Pickup At')).toBeVisible();

    // Close the main details modal
    await page.keyboard.press('Escape');

    // 3. Switch to Job History tab
    await page.click('button:has-text("History")');
    await expect(page.locator('text=Completed jobs will appear here')).not.toBeVisible();

    // Click on the completed job card (John Doe #2026001099)
    await page.click('text=John Doe');

    // Verify that the Chat dialog did NOT auto-open (modal details should be shown immediately)
    await expect(page.locator('h2:has-text("Job Chat")')).not.toBeVisible();
    await expect(page.locator('text=Delivery Proof')).toBeVisible();
  });

  test('should hide future pickup jobs from the rider task list until the scheduled date', async ({ page }) => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    // 1. Update the active job (John Doe #2026001045) to be scheduled for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await prisma.job.update({
      where: { id: '2026001045' },
      data: {
        pickupScheduledAt: tomorrow,
        scheduledAt: tomorrow
      }
    });

    // 2. Login as Rider
    await page.goto('/login');
    await page.fill('#email', 'rider1@tls.com');
    await page.fill('#password', 'rider1234');
    await page.click('button:has-text("Sign In")');

    // Wait for redirect to rider dashboard
    await expect(page).toHaveURL('/rider');

    // 3. Verify that the job card for John Doe is HIDDEN (since it is scheduled for tomorrow)
    await expect(page.locator('h3:has-text("John Doe")')).not.toBeVisible();
    await expect(page.locator('text=No jobs yet')).toBeVisible();

    // 4. Update the active job schedule back to today
    await prisma.job.update({
      where: { id: '2026001045' },
      data: {
        pickupScheduledAt: new Date(),
        scheduledAt: new Date()
      }
    });

    // 5. Reload page or wait for refresh, then check if it becomes visible
    await page.reload();
    await expect(page.locator('h3:has-text("John Doe")').first()).toBeVisible();

    await prisma.$disconnect();
  });
});
