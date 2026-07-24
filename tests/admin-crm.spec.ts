import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { resetAndSeedDatabase, disconnectDatabase } from './helpers/db-helper';

const prisma = new PrismaClient();

test.describe('Category I: Customer CRM', () => {
  test.beforeEach(async () => {
    await resetAndSeedDatabase();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
    await disconnectDatabase();
  });

  test('I1, I2, I3: Create customer, edit info, toggle member', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');

    await expect(page).toHaveURL(/.*admin/);
    await page.click('a[href="#customers"]');

    // I1: Create Customer
    await page.click('button:has-text("Add Customer")');
    await page.fill('input[name="name"]', 'New Test Customer');
    await page.fill('input[name="phone"]', '0812345678');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Customer added successfully')).toBeVisible();

    // Verify in DB
    const newCustomer = await prisma.customer.findFirst({ where: { phone: '0812345678' } });
    expect(newCustomer).not.toBeNull();

    // I2: Edit Customer
    await page.click(`button[data-testid="edit-customer-${newCustomer?.id}"]`);
    await page.fill('input[name="address"]', '123 Test Street');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Customer updated successfully')).toBeVisible();

    // I3: Toggle Member
    await page.click(`button[data-testid="edit-customer-${newCustomer?.id}"]`);
    // Assuming there's a switch or checkbox for isMember
    await page.click('button[role="switch"][aria-label="Member"]'); // standard shadcn switch
    await page.fill('input[name="memberId"]', 'MEM-001');
    await page.click('button:has-text("Save")');
    
    const updatedCustomer = await prisma.customer.findUnique({ where: { id: newCustomer?.id! } });
    expect(updatedCustomer?.isMember).toBe(true);
    expect(updatedCustomer?.memberId).toBe('MEM-001');
  });

  test('I4: Prevent duplicate Member ID', async ({ page }) => {
    // We already have a customer from db-helper.ts (e.g. VIP Customer, or Member Customer)
    // Let's seed a member first
    const existingMember = await prisma.customer.create({
      data: {
        id: "CUST-MEMBER-TEST",
        name: "Existing Member",
        phone: "0999999999",
        isMember: true,
        memberId: "DUP-123"
      }
    });

    await page.goto('/login');
    await page.fill('#email', 'admin@tls.com');
    await page.fill('#password', 'admin1234');
    await page.click('button:has-text("Sign In")');

    await expect(page).toHaveURL(/.*admin/);
    await page.click('a[href="#customers"]');

    await page.click('button:has-text("Add Customer")');
    await page.fill('input[name="name"]', 'Another Member');
    await page.fill('input[name="phone"]', '0888888888');
    await page.click('button[role="switch"][aria-label="Member"]'); 
    await page.fill('input[name="memberId"]', 'DUP-123'); // Duplicate
    
    await page.click('button:has-text("Save")');
    // Verify error toast
    await expect(page.locator('text=มีผู้ใช้งานแล้ว')).toBeVisible();
  });
});
