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
    await page.goto("/");
    await page.waitForSelector("a[href^='/scan/']", { timeout: 10_000 });
    const scanLink = page.locator("a[href^='/scan/']").first();
    const href = await scanLink.getAttribute("href");

    await page.goto(href!);
    await page.waitForURL(href!);
    expect(page.url()).toContain("/scan/");
  });

  test("browser back button works from scanner pages", async ({ page }) => {
    await page.goto("/");
    await page.locator("a[href='/scan/ip']").first().click();
    await expect(page).toHaveURL("/scan/ip");
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
