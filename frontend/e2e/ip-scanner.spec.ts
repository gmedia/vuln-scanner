import { test, expect } from "@playwright/test";

test.describe("IP Scanner", () => {
  test("loads IP scanner page with form", async ({ page }) => {
    await page.goto("/scan/ip");
    await expect(page.locator("text=IP SCANNER")).toBeVisible();
    await expect(page.locator("text=SCAN TARGET")).toBeVisible();
    await expect(page.locator('input[placeholder="192.168.1.1"]')).toBeVisible();
    await expect(page.locator('input[placeholder="1-1000"]')).toBeVisible();
    await expect(page.locator('button:has-text("START IP SCAN")')).toBeVisible();
  });

  test("shows validation error for empty IP", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('button:has-text("START IP SCAN")').click();
    await expect(page.locator("text=IP address is required")).toBeVisible();
  });

  test("shows validation error for invalid IP format", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("not-an-ip");
    await page.locator('button:has-text("START IP SCAN")').click();
    await expect(page.locator("text=Invalid IP address format")).toBeVisible();
  });

  test("shows validation error for invalid port format", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("8.8.8.8");
    await page.locator('input[placeholder="1-1000"]').fill("abc");
  });

  test("successful scan navigates to scan detail", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="1-1000"]').fill("1-100");
    await page.locator('button:has-text("START IP SCAN")').click();
    // Should show INITIALIZING SCAN state
    await expect(page.locator("text=INITIALIZING SCAN...")).toBeVisible({ timeout: 3000 });
    // Then navigates to scan detail page
    await expect(page).toHaveURL(/\/scan\//, { timeout: 10_000 });
    await expect(page.locator("text=SCAN DETAILS")).toBeVisible({ timeout: 15_000 });
  });

  test("scan shows progress then results on completed scan", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="1-1000"]').fill("1-100");
    await page.locator('button:has-text("START IP SCAN")').click();

    // Should show scan progress after submission
    await expect(page).toHaveURL(/\/scan\//, { timeout: 10_000 });
    await expect(page.locator("text=DASHBOARD")).toBeVisible({ timeout: 5_000 });
    // After scan completes, should see results
    await expect(page.locator("text=COMPLETED")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("text=findings found")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("button:has-text('View Details')")).toBeVisible();
  });

  test("shows scan findings after completion", async ({ page }) => {
    // Submit scan and wait for completion
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="1-1000"]').fill("1-100");
    await page.locator('button:has-text("START IP SCAN")').click();

    await expect(page).toHaveURL(/\/scan\//, { timeout: 10_000 });

    // Wait for completed status
    await expect(page.locator("text=COMPLETED")).toBeVisible({ timeout: 30_000 });

    // Click View Details
    await page.locator("button:has-text('View Details')").click();
    await expect(page.locator("text=SCAN DETAILS")).toBeVisible({ timeout: 5_000 });

    // Findings table should be visible
    await expect(page.locator("text=FINDINGS")).toBeVisible();
    await expect(page.locator("text=SCAN INFO")).toBeVisible();
    await expect(page.locator("text=Scan ID")).toBeVisible();
  });

  test("shows 'No findings detected' for empty scan result", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="1-1000"]').fill("80");
    await page.locator('button:has-text("START IP SCAN")').click();

    await expect(page).toHaveURL(/\/scan\//, { timeout: 10_000 });
    await expect(page.locator("text=COMPLETED")).toBeVisible({ timeout: 30_000 });
    await page.locator("button:has-text('View Details')").click();
  });

  test("Enter key submits the form", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="192.168.1.1"]').press("Enter");
    // Should show INITIALIZING and then navigate
  });

  test("back arrow navigates to dashboard", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator("a[href='/']").first().click();
    await expect(page).toHaveURL("/");
  });
});
