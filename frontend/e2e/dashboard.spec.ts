import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("loads and shows all UI elements", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h2:has-text('DASHBOARD')")).toBeVisible();
    await expect(page.locator("text=VULNSCAN").first()).toBeVisible();
    await expect(page.locator("text=Total Scans")).toBeVisible();
    await expect(page.locator("text=Critical")).toBeVisible();
    await expect(page.locator("text=High")).toBeVisible();
    await expect(page.locator("text=Medium")).toBeVisible();
  });

  test("shows quick action cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=New IP Scan")).toBeVisible();
    await expect(page.locator("text=New Domain Scan")).toBeVisible();
    await expect(page.locator("text=Upload APK/IPA")).toBeVisible();
  });

  test("navigates to IP scanner via quick action", async ({ page }) => {
    await page.goto("/");
    await page.locator("text=New IP Scan").click();
    await expect(page).toHaveURL("/scan/ip");
    await expect(page.locator("h2:has-text('IP SCANNER')")).toBeVisible();
  });

  test("navigates to Domain scanner via quick action", async ({ page }) => {
    await page.goto("/");
    await page.locator("text=New Domain Scan").click();
    await expect(page).toHaveURL("/scan/domain");
    await expect(page.locator("h2:has-text('DOMAIN SCANNER')")).toBeVisible();
  });

  test("navigates to Mobile scanner via quick action", async ({ page }) => {
    await page.goto("/");
    await page.locator("text=Upload APK/IPA").click();
    await expect(page).toHaveURL("/scan/mobile");
    await expect(page.locator("h2:has-text('MOBILE SCANNER')")).toBeVisible();
  });

  test("shows scan history list when scans exist", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("a[href^='/scan/']", { timeout: 10_000 });
    const scanCount = await page.locator("a[href^='/scan/']").count();
    expect(scanCount).toBeGreaterThan(0);
  });

  test("clicking a scan history item navigates to scan detail", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("a[href^='/scan/']", { timeout: 10_000 });
    const firstScan = page.locator("a[href^='/scan/']").first();
    const href = await firstScan.getAttribute("href");
    await firstScan.click();
    await expect(page).toHaveURL(href!);
  });

  test("sidebar navigation shows all links", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator("aside").locator("a:has-text('Dashboard')")).toBeVisible();
    await expect(page.locator("aside").locator("a:has-text('IP Scanner')")).toBeVisible();
    await expect(page.locator("aside").locator("a:has-text('Domain Scanner')")).toBeVisible();
    await expect(page.locator("aside").locator("a:has-text('Mobile Scanner')")).toBeVisible();
  });

  test("sidebar nav items navigate to correct pages", async ({ page }) => {
    await page.goto("/");
    await page.locator("aside").locator("a:has-text('IP Scanner')").click();
    await expect(page).toHaveURL("/scan/ip");

    await page.locator("aside").locator("a:has-text('Domain Scanner')").click();
    await expect(page).toHaveURL("/scan/domain");

    await page.locator("aside").locator("a:has-text('Mobile Scanner')").click();
    await expect(page).toHaveURL("/scan/mobile");

    await page.locator("aside").locator("a:has-text('Dashboard')").click();
    await expect(page).toHaveURL("/");
  });
});
