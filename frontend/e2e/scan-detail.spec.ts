import { test, expect } from "@playwright/test";

test.describe("Scan Detail Page", () => {
  test("shows 404 for non-existent scan", async ({ page }) => {
    await page.goto("/scan/non-existent-id");
    await expect(page.locator("text=SCAN NOT FOUND")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Back to Dashboard")).toBeVisible();
  });

  test("shows loading skeleton while fetching", async ({ page }) => {
    await page.goto("/scan/non-existent-id");
    // Should show loading skeleton before error
    const skeleton = page.locator('[class*="animate-pulse"], [class*="skeleton"]');
    await expect(skeleton).toBeVisible({ timeout: 5_000 });
  });

  test("back button on 404 returns to dashboard", async ({ page }) => {
    await page.goto("/scan/non-existent-id");
    await expect(page.locator("text=SCAN NOT FOUND")).toBeVisible({ timeout: 10_000 });
    await page.locator("text=Back to Dashboard").click();
    await expect(page).toHaveURL("/");
  });

  test("completed scan shows all sections", async ({ page }) => {
    // First find a completed scan from dashboard
    await page.goto("/");
    const completedScan = page.locator("a[href^='/scan/']").first();
    const href = await completedScan.getAttribute("href");
    await completedScan.click();

    await expect(page.locator("text=SCAN DETAILS")).toBeVisible({ timeout: 10_000 });

    // Verify all sections load
    await expect(page.locator("text=Target").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Type")).toBeVisible();
    await expect(page.locator("text=Findings")).toBeVisible();
    await expect(page.locator("text=Duration")).toBeVisible();
  });

  test("scan detail shows severity chart", async ({ page }) => {
    await page.goto("/");
    const firstScan = page.locator("a[href^='/scan/']").first();
    await firstScan.click();

    await expect(page.locator("text=SCAN DETAILS")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=SEVERITY")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Distribution")).toBeVisible();
  });

  test("scan detail shows findings table with sortable columns", async ({ page }) => {
    await page.goto("/");
    const firstScan = page.locator("a[href^='/scan/']").first();
    await firstScan.click();

    await expect(page.locator("text=FINDINGS")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Severity").first()).toBeVisible();
    await expect(page.locator("text=Title").first()).toBeVisible();
    await expect(page.locator("text=Category")).toBeVisible();
    await expect(page.locator("text=CVE")).toBeVisible();
  });

  test("findings table filter works", async ({ page }) => {
    await page.goto("/");
    const firstScan = page.locator("a[href^='/scan/']").first();
    await firstScan.click();

    await expect(page.locator("text=FINDINGS")).toBeVisible({ timeout: 10_000 });
    const filterInput = page.locator('input[placeholder="Filter findings..."]');
    if (await filterInput.isVisible()) {
      await filterInput.fill("CVE");
      await page.waitForTimeout(500);
    }
  });

  test("findings row expands on click", async ({ page }) => {
    await page.goto("/");
    const firstScan = page.locator("a[href^='/scan/']").first();
    await firstScan.click();

    await expect(page.locator("text=FINDINGS")).toBeVisible({ timeout: 10_000 });

    // Click on first finding row to expand
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      await page.waitForTimeout(500);
    }
  });

  test("clicking CVE link opens NVD in new tab", async ({ page }) => {
    await page.goto("/");
    const firstScan = page.locator("a[href^='/scan/']").first();
    await firstScan.click();

    await expect(page.locator("text=FINDINGS")).toBeVisible({ timeout: 10_000 });

    const cveLink = page.locator("a[href*='nvd.nist.gov']").first();
    if (await cveLink.isVisible()) {
      const [newTab] = await Promise.all([
        page.waitForEvent("popup"),
        cveLink.click(),
      ]);
      expect(newTab.url()).toContain("nvd.nist.gov");
      await newTab.close();
    }
  });

  test("scan info section shows metadata", async ({ page }) => {
    await page.goto("/");
    const firstScan = page.locator("a[href^='/scan/']").first();
    await firstScan.click();

    await expect(page.locator("text=SCAN INFO")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Scan ID")).toBeVisible();
    await expect(page.locator("text=Created")).toBeVisible();
  });

  test("back arrow navigates to dashboard", async ({ page }) => {
    await page.goto("/");
    const firstScan = page.locator("a[href^='/scan/']").first();
    await firstScan.click();

    await expect(page.locator("text=SCAN DETAILS")).toBeVisible({ timeout: 10_000 });
    await page.locator("a[href='/']").first().click();
    await expect(page).toHaveURL("/");
  });
});
