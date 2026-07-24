import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

const prisma = new PrismaClient();

test.describe('Category G & H: Admin Settings and Service Menu', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
    await disconnectDatabase();
  });

  test.describe('Category G: Admin Settings', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('#email', 'admin@tls.com');
      await page.fill('#password', 'admin1234');
      await page.click('button:has-text("Sign In")');
      await expect(page).toHaveURL(/.*admin/);
    });

    test('G1: Rider Commission', async ({ page }) => {
      await page.click('a[href="#settings"]');
      // Logic for rider commission settings
    });

    test('G2: Add/Edit/Delete Price List', async ({ page }) => {
      await page.click('a[href="#settings"]');
      // Logic for price list management
    });

    test('G3: Add Branch', async ({ page }) => {
      await page.click('a[href="#settings"]');
      // Logic to add a branch
    });

    test('G4: VAT Settings', async ({ page }) => {
      await page.click('a[href="#settings"]');
      // Logic for VAT settings
    });

    test('G5: Receipt Size', async ({ page }) => {
      await page.click('a[href="#settings"]');
      // Logic for Receipt size settings
    });
  });

  test.describe('Category H: Service Menu Management', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/login');
      await page.fill('#email', 'admin@tls.com');
      await page.fill('#password', 'admin1234');
      await page.click('button:has-text("Sign In")');
      await expect(page).toHaveURL(/.*admin/);
    });

    test('H1: Add/Edit/Delete Service', async ({ page }) => {
      await page.click('a[href="#menu"]');
      // Logic for adding, editing, and deleting a service
    });

    test('H2: PACKAGE bonus calculation', async ({ page }) => {
      await page.click('a[href="#menu"]');
      // Logic for testing package bonus calculation
    });
  });
});
