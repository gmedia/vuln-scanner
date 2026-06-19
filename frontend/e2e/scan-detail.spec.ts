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

  test("completed scan shows all sections", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    // Find first completed scan with findings
    const scanLink = page.locator("a[href^='/scan/']").filter({ hasText: "completed" }).first();
    const href = await scanLink.getAttribute("href");
    if (href) {
      await page.goto(href);
      await expect(page.locator("h2:has-text('SCAN DETAILS')")).toBeVisible({ timeout: 15_000 });
    }
  });

  test("scan detail shows severity chart", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    const scanLink = page.locator("a[href^='/scan/']").filter({ hasText: "completed" }).first();
    const href = await scanLink.getAttribute("href");
    if (href) {
      await page.goto(href);
      await expect(page.locator("h3:has-text('SEVERITY')")).toBeVisible({ timeout: 15_000 });
    }
  });

  test("scan detail shows findings table headers", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    const scanLink = page.locator("a[href^='/scan/']").filter({ hasText: "completed" }).first();
    const href = await scanLink.getAttribute("href");
    if (href) {
      await page.goto(href);
      await expect(page.locator("h3:has-text('FINDINGS')")).toBeVisible({ timeout: 15_000 });
    }
  });

  test("scan info section shows metadata", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    const scanLink = page.locator("a[href^='/scan/']").filter({ hasText: "completed" }).first();
    const href = await scanLink.getAttribute("href");
    if (href) {
      await page.goto(href);
      await expect(page.locator("h3:has-text('SCAN INFO')")).toBeVisible({ timeout: 15_000 });
    }
  });

  test("back arrow navigates to dashboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
    const scanLink = page.locator("a[href^='/scan/']").filter({ hasText: "completed" }).first();
    const href = await scanLink.getAttribute("href");
    if (href) {
      await page.goto(href);
      await expect(page.locator("h2:has-text('SCAN DETAILS')")).toBeVisible({ timeout: 15_000 });
      await page.locator("a[href='/']").first().click();
      await expect(page).toHaveURL("/");
    }
  });
});
