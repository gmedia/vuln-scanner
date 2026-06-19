import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("all routes render without crashing", async ({ page }) => {
    const routes = ["/", "/scan/ip", "/scan/domain", "/scan/mobile", "/nonexistent"];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(1000);
      expect(await page.locator("body").isVisible()).toBe(true);
    }
  });

  test("deep linking to a scan detail loads correctly", async ({ page }) => {
    // First get a scan ID from dashboard
    await page.goto("/");
    const scanLink = page.locator("a[href^='/scan/']").first();
    const href = await scanLink.getAttribute("href");

    if (href) {
      // Deep link directly
      await page.goto(href);
      await expect(page.locator("text=SCAN DETAILS")).toBeVisible({ timeout: 10_000 });
    }
  });

  test("browser back button works from scanner pages", async ({ page }) => {
    await page.goto("/scan/ip");
    await expect(page.locator("text=IP SCANNER")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL("/");
  });

  test("browser back and forward navigation", async ({ page }) => {
    await page.goto("/");
    await page.locator("aside").locator("text=Domain Scanner").click();
    await expect(page).toHaveURL("/scan/domain");

    await page.goBack();
    await expect(page).toHaveURL("/");

    await page.goForward();
    await expect(page).toHaveURL("/scan/domain");
  });

  test("header shows VULNSCAN branding", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header")).toContainText("VULNSCAN");
  });

  test("sidebar shows version info", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=VulnScanner v0.1.0")).toBeVisible();
  });
});
