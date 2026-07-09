import { test, expect } from '@playwright/test';

test('verify POS-like button category and service layout inside dialog', async ({ page }) => {
  // 1. Go to login page
  await page.goto('http://localhost:3060/login');

  // 2. Login
  await page.fill('input[type="email"]', 'admin@tls.com');
  await page.fill('input[type="password"]', 'admin1234');
  await page.click('button[type="submit"]');

  // Wait for admin dashboard navigation
  await expect(page).toHaveURL(/.*admin/);
  await page.waitForTimeout(2000);

  // 2b. Navigate to POS to open shift if not already active via sidebar click
  console.log("Clicking POS in sidebar to ensure cashier shift is open...");
  await page.click('a[href="#pos"]');
  await page.waitForTimeout(2000);

  // Wait for loading screen to disappear
  const loader = page.locator('text=Checking shift status, text=กำลังตรวจสอบสถานะกะพนักงาน');
  try {
    await expect(loader).toBeHidden({ timeout: 10000 });
    console.log("POS shift check loader hidden.");
  } catch (e) {
    console.log("Loader did not disappear or wasn't shown.");
  }
  await page.waitForTimeout(1000);

  // Check if branch selector is visible
  const branchCard = page.locator('button:has-text("That Laundry Shop"), button:has-text("สาขา")').first();
  if (await branchCard.isVisible()) {
    console.log("Clicking branch: That Laundry Shop...");
    await branchCard.click();
    await page.waitForTimeout(1000);
  } else {
    console.log("Branch card not visible (likely single-shop or already selected).");
  }

  // Check if starting float input is visible
  const startingCashInput = page.locator('input#startingCash');
  if (await startingCashInput.isVisible()) {
    console.log("Opening cashier shift with starting cash 1000...");
    await startingCashInput.fill('1000');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  } else {
    console.log("Starting cash input not visible (likely shift already open).");
  }

  // Go back to Jobs tab via sidebar click
  console.log("Navigating back to Jobs tab...");
  await page.click('a[href="#jobs"]');
  await page.waitForTimeout(2000);

  // 3. Click "Create New Job" button in top-bar header
  console.log("Opening Create New Job Dialog...");
  const createJobButton = page.locator('button:has-text("Create New Job")');
  await expect(createJobButton).toBeVisible();
  await createJobButton.click();

  // 4. Dialog should open
  const dialog = page.locator('div[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  console.log("Create New Job Dialog is visible.");

  // Locate the Laundry Service Type container
  const container = dialog.locator('div:has(label:text-is("Laundry Service Type"))').last();
  await expect(container).toBeVisible();

  // Verify that "Other (Custom Price)" button is visible inside container
  const otherButton = container.locator('button:has-text("Other (Custom Price)")');
  await expect(otherButton).toBeVisible();

  // 5. Click on the "DRY CLEAN" category button
  const dryCleanButton = container.locator('button:text-is("DRY CLEAN")');
  await expect(dryCleanButton).toBeVisible();
  console.log("Clicking category: DRY CLEAN");
  await dryCleanButton.click();
  await page.waitForTimeout(1000);

  // Take screenshot of the category items view before adding
  await page.screenshot({ path: 'test-results/pos-category-items-before.png' });

  // Locate first service button in DRY CLEAN category and click to add it
  const serviceBtn = container.locator('button').nth(1); // 0th is Back, 1st is first item
  const serviceName = await serviceBtn.locator('span').first().innerText();
  console.log(`Adding service: ${serviceName}`);
  await serviceBtn.click();
  await page.waitForTimeout(500);

  // Click again to increment count to 2
  await serviceBtn.click();
  await page.waitForTimeout(500);

  // Verify count badge on the button shows '2'
  const countBadge = serviceBtn.locator('span.absolute');
  await expect(countBadge).toHaveText('2');
  console.log("Count badge shows '2' correctly.");

  // Verify it appears in "Order Items" list in Column 3
  const orderItemsList = dialog.locator('#order-items-list');
  await expect(orderItemsList).toBeVisible();
  const addedItemRow = orderItemsList.locator(`div:has-text("${serviceName}")`).first();
  await expect(addedItemRow).toBeVisible();
  console.log("Item successfully appears in Order Items list.");

  // Take screenshot of items added
  await page.screenshot({ path: 'test-results/pos-category-items-added.png' });

  // Verify "Back to Categories" button is visible
  const backBtn = container.locator('button:has-text("Back to Categories")');
  await expect(backBtn).toBeVisible();

  // Click back button to return to categories view
  console.log("Clicking Back to Categories...");
  await backBtn.click();
  await page.waitForTimeout(1000);
  await expect(otherButton).toBeVisible();

  // Close dialog
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
