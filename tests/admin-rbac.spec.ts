import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

const prisma = new PrismaClient();

test.describe('Category L: Role-Based Access Control', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
    await disconnectDatabase();
  });

  test('L1: Manager cannot access Settings or CRM (if restricted)', async ({ page }) => {
    // Seed a manager user
    await prisma.adminUser.create({
      data: {
        email: "manager@tls.com",
        password: "manager1234",
        name: "Test Manager",
        role: "manager",
        permissions: JSON.stringify(["jobs", "pos"]),
        area: "BRANCH-01",
      },
    });

    await page.goto('/login');
    await page.fill('#email', 'manager@tls.com');
    await page.fill('#password', 'manager1234');
    await page.click('button:has-text("Sign In")');

    await expect(page).toHaveURL(/.*admin/);
    
    // Verify Settings link is hidden or inaccessible
    const settingsLink = page.locator('a[href="#settings"]');
    if (await settingsLink.isVisible()) {
      // If it is visible, clicking it should show an error or it shouldn't be there
      await settingsLink.click();
      await expect(page.locator('text=Access Denied')).toBeVisible();
    } else {
      // It's properly hidden
      expect(await settingsLink.isVisible()).toBe(false);
    }
  });

  test('L2: Manager only sees their branch orders', async ({ page }) => {
    // Create another branch and jobs
    const branch2 = await prisma.branch.create({
      data: { id: "BRANCH-02", name: "Branch 2", address: "123", area: "CNX", lat: 0, lng: 0 }
    });

    await prisma.job.create({
      data: {
        id: "JOB-BRANCH-02",
        orderNumber: "ORD-02",
        branchId: "BRANCH-02",
        customerId: "CUST-01",
        customerName: "Test Cust",
        customerPhone: "000",
        customerAddress: "Addr",
        itemsJson: "[]",
        status: "pending",
        totalAmount: 100,
        paymentStatus: "unpaid",
        legType: "none"
      }
    });

    // Login as the manager we seeded in L1 (requires re-seeding if we didn't, but beforeEach resets)
    await prisma.adminUser.create({
      data: {
        email: "manager@tls.com",
        password: "manager1234",
        name: "Test Manager",
        role: "manager",
        permissions: JSON.stringify(["jobs", "pos"]),
        area: "BRANCH-01", // The seeded branch from db-helper
      },
    });

    await page.goto('/login');
    await page.fill('#email', 'manager@tls.com');
    await page.fill('#password', 'manager1234');
    await page.click('button:has-text("Sign In")');

    await expect(page).toHaveURL(/.*admin/);
    
    // They should not see JOB-BRANCH-02
    await page.click('a[href="#jobs"]');
    
    // Job from BRANCH-01 (seeded in db-helper) should be visible
    await expect(page.locator('text=Active Job 1')).toBeVisible(); // from db-helper

    // Job from BRANCH-02 should NOT be visible
    await expect(page.locator('text=JOB-BRANCH-02')).not.toBeVisible();
    await expect(page.locator('text=ORD-02')).not.toBeVisible();
  });
});
