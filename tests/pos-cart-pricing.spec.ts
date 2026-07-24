import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

const prisma = new PrismaClient();

test.describe('POS Cart & Pricing', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase();
    
    // Seed a Package item for the tests
    await prisma.serviceItem.create({
      data: { id: "item-package-1", name: "Wash & Iron Package", price: 500, memberPrice: 450, category: "Package", unit: "pkg" }
    });

    // Login
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.locator('button:has-text("Sign In")').click({ force: true });

    // Wait for redirect to admin and navigate to POS
    await expect(page).toHaveURL(/.*admin/);
    await page.locator('a[href="#pos"]').click({ force: true });
    await expect(page.locator('text=Point of Sale')).toBeVisible();
    await page.waitForTimeout(500); // Wait for POS to settle
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
    await disconnectDatabase();
  });

  test.describe('Category B: Cart & Service Items', () => {
    test('B1: Add item to cart', async ({ page }) => {
      await page.locator('h3:has-text("Weight")').click({ force: true });
      await page.locator('h3[title="Standard Wash & Fold"]').click({ force: true });
      await expect(page.locator('.cart-item, [title="Remove item"]').first()).toBeVisible();
    });

    test('B2: Remove item from cart', async ({ page }) => {
      await page.locator('h3:has-text("Weight")').click({ force: true });
      await page.locator('h3[title="Standard Wash & Fold"]').click({ force: true });
      await page.locator('[title="Remove item"]').click({ force: true });
      await expect(page.locator('text=Cart is empty')).toBeVisible();
    });

    test('B3: Filter items by category', async ({ page }) => {
      await page.locator('h3:has-text("Clothing")').click({ force: true });
      await expect(page.locator('h3[title="Polo Shirt"]')).toBeVisible();
      await expect(page.locator('h3[title="Standard Wash & Fold"]')).not.toBeVisible();
    });

    test('B4: Add a PACKAGE item to cart', async ({ page }) => {
      await page.locator('h3:has-text("Package")').click({ force: true });
      await page.locator('h3[title="Wash & Iron Package"]').click({ force: true });
      await expect(page.locator('[title="Remove item"]').first()).toBeVisible();
      await expect(page.locator('text=500.00').first()).toBeVisible();
    });
  });

  test.describe('Category C: Pricing & Calculation', () => {
    test('C2: VAT calculations (Inclusive and Exclusive)', async ({ page }) => {
      await prisma.setting.upsert({
        where: { key: 'vatType' },
        update: { value: 'inclusive' },
        create: { key: 'vatType', value: 'inclusive' }
      });
      await prisma.setting.upsert({
        where: { key: 'vatRate' },
        update: { value: '7' },
        create: { key: 'vatRate', value: '7' }
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      await page.locator('h3:has-text("Package")').click({ force: true });
      await page.locator('h3[title="Wash & Iron Package"]').click({ force: true });
      
      await expect(page.locator('text=32.71').first()).toBeVisible();

      await prisma.setting.upsert({
        where: { key: 'vatType' },
        update: { value: 'exclusive' },
        create: { key: 'vatType', value: 'exclusive' }
      });
      await page.reload();
      await page.waitForLoadState('networkidle');

      await page.locator('h3:has-text("Package")').click({ force: true });
      await page.locator('h3[title="Wash & Iron Package"]').click({ force: true });
      
      await expect(page.locator('text=35.00').first()).toBeVisible();
      await expect(page.locator('text=535.00').first()).toBeVisible();
    });

    test('C5: Calculate Change Due', async ({ page }) => {
      await page.locator('h3:has-text("Package")').click({ force: true });
      await page.locator('h3[title="Wash & Iron Package"]').click({ force: true }); // 500
      
      // Click PAID
      await page.getByRole('button', { name: 'PAID', exact: true }).click({ force: true });
      
      // Select Cash
      await page.locator('button:has-text("Cash")').click({ force: true });
      
      // Type 1000 in Received Cash
      await page.locator('input[placeholder="0.00"]').fill('1000');
      
      // Verify change due is 500
      await expect(page.locator('text=500.00').nth(1)).toBeVisible();
    });
  });
});
