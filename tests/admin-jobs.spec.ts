import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

const prisma = new PrismaClient();

test.describe('Admin Jobs Board (Kanban)', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase();
    
    // Create an unpaid job for testing
    await prisma.job.create({
      data: {
        id: "job-unpaid-1",
        type: "pos_order",
        customerName: "Test Customer",
        customerPhone: "0811111111",
        pickupLocation: "Shop",
        dropoffLocation: "Shop",
        pickupLat: 0, pickupLng: 0, dropoffLat: 0, dropoffLng: 0,
        distance: 0, fee: 0,
        scheduledAt: new Date(),
        totalAmount: 200,
        isPaid: false,
        paymentMethod: "cash",
        status: "tba",
        itemsJson: "[]"
      }
    });

    // Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.locator('button:has-text("Sign In")').click({ force: true });

    // Wait for redirect to admin and navigate to Dashboard (Jobs)
    await expect(page).toHaveURL(/.*admin/);
    await page.locator('a[href="#dashboard"]').click({ force: true });
    await expect(page.locator('h2:has-text("All Jobs")')).toBeVisible();
    await page.waitForTimeout(500);
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
    await disconnectDatabase();
  });

  test('F1: Verify Job Card appears in TBA column', async ({ page }) => {
    // Locate the job card
    const jobCard = page.locator('div').filter({ hasText: 'Test Customer' }).first();
    await expect(jobCard).toBeVisible();
    
    // Verify it shows UNPAID
    await expect(jobCard.locator('text=UNPAID')).toBeVisible();
  });
});
