import { test, expect } from "@playwright/test";

test.describe("Auth — Reset Password", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("reset password page without token shows invalid link message", async ({
    page,
  }) => {
    await page.goto("/reset-password");
    await expect(
      page.locator("h2:has-text('Invalid Reset Link')"),
    ).toBeVisible();
  });

  test("reset password page with token renders form", async ({ page }) => {
    await page.goto("/reset-password?token=fake-test-token-123");
    await expect(page.locator("input#password")).toBeVisible();
    await expect(page.locator("input#confirmPassword")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("reset password with empty fields shows browser validation", async ({
    page,
  }) => {
    await page.goto("/reset-password?token=fake-test-token-123");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("input#password:invalid")).toBeVisible();
  });

  test("reset password with mismatched passwords shows validation", async ({
    page,
  }) => {
    await page.goto("/reset-password?token=fake-test-token-123");
    await page.locator("input#password").fill("NewPass123!");
    await page.locator("input#confirmPassword").fill("DifferentPass123!");
    await page.locator("button[type='submit']").click();
    await expect(page.locator(".text-red-400")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("reset password with short password shows validation", async ({
    page,
  }) => {
    await page.goto("/reset-password?token=fake-test-token-123");
    await page.locator("input#password").fill("short");
    await page.locator("input#confirmPassword").fill("short");
    await page.locator("button[type='submit']").click();
    await expect(page.locator(".text-red-400")).toBeVisible({
      timeout: 10_000,
    });
  });
});
