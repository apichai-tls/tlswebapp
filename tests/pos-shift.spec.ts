import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

const prisma = new PrismaClient();

test.describe('Category A: Cashier Shift Management', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
    await disconnectDatabase();
  });

  test('A2: Prevent POS access without an open shift', async ({ page }) => {
    // Delete the seeded open shift to simulate a fresh start
    await prisma.cashierShift.deleteMany();

    // Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');

    // Wait for redirect to admin
    await expect(page).toHaveURL(/.*admin/);
    
    // Navigate to POS
    await page.click('a[href="#pos"]');

    // Verify the "Open Shift" overlay is visible by checking for the submit button
    await expect(page.locator('button:has-text("Open Shift")')).toBeVisible();
  });

  test('A1: Open a normal shift successfully', async ({ page }) => {
    await prisma.cashierShift.deleteMany();

    // Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');

    await expect(page).toHaveURL(/.*admin/);
    await page.click('a[href="#pos"]');

    // Fill in starting cash and open shift
    await page.fill('input[type="number"]', '1000'); // Assuming the only number input in the dialog is starting cash
    await page.click('button:has-text("Open Shift")');

    // Verify overlay disappears and POS is accessible
    await expect(page.locator('text=Starting Float')).not.toBeVisible();
    await expect(page.locator('text=Point of Sale')).toBeVisible();
    
    // Verify shift is recorded in DB
    const activeShift = await prisma.cashierShift.findFirst({ where: { status: 'open' } });
    expect(activeShift).not.toBeNull();
    expect(activeShift?.startingCash).toBe(1000);
  });
});
