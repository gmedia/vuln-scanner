import { test, expect } from "@playwright/test";

test.describe("Auth — Forgot Password", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("forgot password page renders correctly", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator("h3")).toContainText("Reset Password");
    await expect(page.locator("input#email")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("forgot password with valid email shows success message", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.locator("input#email").fill("e2e@vulnscan.dev");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("h2:has-text('Check Your Email')")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("forgot password with empty email shows browser validation", async ({
    page,
  }) => {
    await page.goto("/forgot-password");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("input#email:invalid")).toBeVisible();
  });

  test("forgot password page has link to login", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator("a[href='/login']")).toBeVisible();
  });
});
