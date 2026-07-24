import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

const prisma = new PrismaClient();

test.describe('POS Checkout & Customer', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await resetAndSeedDatabase();
    
    // Seed test customers
    await prisma.customer.create({
      data: { id: "cust-member-1", name: "Rich Member", phone: "0811111111", isMember: true, creditBalance: 5000 }
    });
    await prisma.customer.create({
      data: { id: "cust-member-2", name: "Poor Member", phone: "0822222222", isMember: true, creditBalance: 50 }
    });
    
    // Seed test item
    await prisma.serviceItem.create({
      data: { id: "item-shirt", name: "Test Shirt", price: 100, memberPrice: 80, category: "Clothing", unit: "piece" }
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

  test.describe('Category D: Customer & Payment', () => {
    test('D1: Walk-in customer (default) has no wallet and regular pricing', async ({ page }) => {
      await page.locator('h3:has-text("Clothing")').click({ force: true });
      await page.locator('h3[title="Test Shirt"]').click({ force: true });
      
      // Regular price is 100
      await expect(page.locator('text=100.00').first()).toBeVisible();
      
      // Click PAID
      await page.getByRole('button', { name: 'PAID', exact: true }).click({ force: true });
      
      // Wallet option should NOT be visible
      await expect(page.locator('button:has-text("Wallet")')).not.toBeVisible();
    });

    test('D2: Select Member customer applies Member Pricing', async ({ page }) => {
      // Add item
      await page.locator('h3:has-text("Clothing")').click({ force: true });
      await page.locator('h3[title="Test Shirt"]').click({ force: true });
      
      // Search Customer
      await page.locator('input[placeholder*="customer"], input[placeholder*="ค้นหา"]').fill('Rich Member');
      // Click the dropdown result
      await page.locator('button', { hasText: 'Rich Member' }).click({ force: true });
      
      // Member price is 80
      await expect(page.locator('text=80.00').first()).toBeVisible();
    });

    test('D3: Member Wallet Payment with sufficient balance', async ({ page }) => {
      // Search Customer
      await page.locator('input[placeholder*="customer"], input[placeholder*="ค้นหา"]').fill('Rich Member');
      // Click the dropdown result
      await page.locator('button', { hasText: 'Rich Member' }).click({ force: true });

      // Add item
      await page.locator('h3:has-text("Clothing")').click({ force: true });
      await page.locator('h3[title="Test Shirt"]').click({ force: true });
      
      // Click PAID
      await page.getByRole('button', { name: 'PAID', exact: true }).click({ force: true });
      
      // Select Wallet
      await page.locator('button:has-text("Wallet")').click({ force: true });
      
      // Verify payment selected and checkout is enabled (Pay ฿... button is enabled)
      const payButton = page.locator('button:has-text("Pay ฿")');
      await expect(payButton).toBeEnabled();
    });
  });

  test.describe('Category E: Order Submission', () => {
    test('E1: Create Paid Order with Cash', async ({ page }) => {
      await page.locator('h3:has-text("Clothing")').click({ force: true });
      await page.locator('h3[title="Test Shirt"]').click({ force: true }); // 100
      
      // Click PAID
      await page.getByRole('button', { name: 'PAID', exact: true }).click({ force: true });
      
      // Select Cash
      await page.locator('button:has-text("Cash")').click({ force: true });
      
      // Type 100 in Received Cash
      await page.locator('input[placeholder="0.00"]').fill('100');
      
      // Checkout (Pay ฿...)
      await page.locator('button:has-text("Pay ฿")').click({ force: true });
      
      // Should show Receipt modal or success toast
      await expect(page.locator('text=Success').first()).toBeVisible();
    });
  });
});
