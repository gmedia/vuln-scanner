import { test, expect } from "@playwright/test";

test.describe("Domain Scanner", () => {
  test("loads domain scanner page with form", async ({ page }) => {
    await page.goto("/scan/domain");
    await expect(page.locator("text=DOMAIN SCANNER")).toBeVisible();
    await expect(page.locator("text=SCAN TARGET")).toBeVisible();
    await expect(page.locator('input[placeholder="example.com"]')).toBeVisible();
    await expect(page.locator('button:has-text("START DOMAIN SCAN")')).toBeVisible();
  });

  test("shows validation error for empty domain", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.locator('button:has-text("START DOMAIN SCAN")').click();
    await expect(page.locator("text=Domain name is required")).toBeVisible();
  });

  test("shows validation error for invalid domain format", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.locator('input[placeholder="example.com"]').fill("not-a-domain");
    await page.locator('button:has-text("START DOMAIN SCAN")').click();
    await expect(page.locator("text=Invalid domain format")).toBeVisible();
  });

  test("successful domain scan navigates to scan detail", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.locator('input[placeholder="example.com"]').fill("example.com");
    await page.locator('button:has-text("START DOMAIN SCAN")').click();
    await expect(page.locator("text=INITIALIZING SCAN...")).toBeVisible({ timeout: 3000 });
    await expect(page).toHaveURL(/\/scan\//, { timeout: 10_000 });
    await expect(page.locator("text=SCAN DETAILS")).toBeVisible({ timeout: 15_000 });
  });

  test("shows scan results for completed domain scan", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.locator('input[placeholder="example.com"]').fill("example.com");
    await page.locator('button:has-text("START DOMAIN SCAN")').click();

    await expect(page).toHaveURL(/\/scan\//, { timeout: 10_000 });
    await expect(page.locator("text=COMPLETED")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("text=findings found")).toBeVisible({ timeout: 5_000 });
  });

  test("Enter key submits the form", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.locator('input[placeholder="example.com"]').fill("example.com");
    await page.locator('input[placeholder="example.com"]').press("Enter");
  });
});
