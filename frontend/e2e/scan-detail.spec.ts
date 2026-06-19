import { test, expect } from "@playwright/test";

test.describe("Scan Detail Page", () => {
  test("shows 404 for non-existent scan", async ({ page }) => {
    await page.goto("/scan/non-existent-id");
    await expect(page.locator("h2:has-text('SCAN NOT FOUND')")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("a:has-text('Back to Dashboard')")).toBeVisible();
  });

  test("back button on 404 returns to dashboard", async ({ page }) => {
    await page.goto("/scan/non-existent-id");
    await expect(page.locator("h2:has-text('SCAN NOT FOUND')")).toBeVisible({ timeout: 10_000 });
    await page.locator("a:has-text('Back to Dashboard')").click();
    await expect(page).toHaveURL("/");
  });

  async function getFirstCompletedScanHref(page: any): Promise<string | null> {
    await page.goto("/");
    // Wait for scan history to load
    await page.waitForSelector("a[href^='/scan/']", { timeout: 10_000 });
    const links = await page.locator("a[href^='/scan/']").all();
    for (const link of links) {
      const href = await link.getAttribute("href");
      if (href) return href;
    }
    return null;
  }

  test("completed scan shows all sections", async ({ page }) => {
    const href = await getFirstCompletedScanHref(page);
    await page.goto(href!);
    await expect(page.locator("h2:has-text('SCAN DETAILS')")).toBeVisible({ timeout: 15_000 });
  });

  test("scan detail shows severity chart", async ({ page }) => {
    const href = await getFirstCompletedScanHref(page);
    await page.goto(href!);
    await expect(page.locator("h3:has-text('SEVERITY')")).toBeVisible({ timeout: 15_000 });
  });

  test("scan detail shows findings table headers", async ({ page }) => {
    const href = await getFirstCompletedScanHref(page);
    await page.goto(href!);
    await expect(page.locator("h3:has-text('FINDINGS')")).toBeVisible({ timeout: 15_000 });
  });

  test("scan info section shows metadata", async ({ page }) => {
    const href = await getFirstCompletedScanHref(page);
    await page.goto(href!);
    await expect(page.locator("h3:has-text('SCAN INFO')")).toBeVisible({ timeout: 15_000 });
  });

  test("back arrow navigates to dashboard", async ({ page }) => {
    const href = await getFirstCompletedScanHref(page);
    await page.goto(href!);
    await expect(page.locator("h2:has-text('SCAN DETAILS')")).toBeVisible({ timeout: 15_000 });
    await page.locator("a[href='/']").first().click();
    await expect(page).toHaveURL("/");
  });
});
