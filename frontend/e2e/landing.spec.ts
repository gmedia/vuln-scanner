import { test, expect } from "@playwright/test";

test.describe("Landing", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("page loads with VulnScanner heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1:has-text('VulnScanner')")).toBeVisible();
  });

  test("shows tagline text", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator("text=Web-based vulnerability scanner"),
    ).toBeVisible();
  });

  test("Get Started button links to register", async ({ page }) => {
    await page.goto("/");
    const getStartedLink = page.locator("a[href='/register']").first();
    await expect(getStartedLink).toBeVisible();
    await expect(getStartedLink.locator("text=Get Started")).toBeVisible();
  });

  test("Sign In button links to login", async ({ page }) => {
    await page.goto("/");
    const signInLink = page.locator("a[href='/login']").first();
    await expect(signInLink).toBeVisible();
    await expect(signInLink.locator("text=Sign In")).toBeVisible();
  });

  test("FEATURES section heading is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h2:has-text('Features')")).toBeVisible();
  });

  test("renders IP Scanner feature card", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("text=IP Scanner");
    await expect(card).toBeVisible();
    await expect(
      page.locator("text=Port scanning with CVE lookup and severity scoring"),
    ).toBeVisible();
  });

  test("renders Domain Scanner feature card", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("text=Domain Scanner");
    await expect(card).toBeVisible();
    await expect(
      page.locator("text=DNS, SSL/TLS, headers, and tech fingerprinting"),
    ).toBeVisible();
  });

  test("renders Mobile Scanner feature card", async ({ page }) => {
    await page.goto("/");
    const card = page.locator("text=Mobile Scanner");
    await expect(card).toBeVisible();
    await expect(
      page.locator("text=APK/IPA static analysis and secret detection"),
    ).toBeVisible();
  });

  test("footer shows version", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=VulnScanner v0.1.0")).toBeVisible();
  });
});
