import { test, expect } from "@playwright/test";

test.describe("Verify Email", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.describe("no token — resend form", () => {
    test("shows VULNSCANNER branding", async ({ page }) => {
      await page.goto("/verify-email");
      await expect(page.locator("text=VULNSCANNER")).toBeVisible();
    });

    test("shows Check Your Email card title", async ({ page }) => {
      await page.goto("/verify-email");
      await expect(page.locator("text=Check Your Email")).toBeVisible();
    });

    test("shows instructional text", async ({ page }) => {
      await page.goto("/verify-email");
      await expect(
        page.locator("text=We've sent a verification link to your email address"),
      ).toBeVisible();
    });

    test("Back to Login button is visible", async ({ page }) => {
      await page.goto("/verify-email");
      await expect(
        page.locator("a[href='/login']").locator("text=Back to Login"),
      ).toBeVisible();
    });

    test("resend email input has correct placeholder", async ({ page }) => {
      await page.goto("/verify-email");
      const emailInput = page.locator("input[type='email']");
      await expect(emailInput).toHaveAttribute("placeholder", "you@example.com");
    });

    test("resend button is enabled when email is filled", async ({ page }) => {
      await page.goto("/verify-email");
      const emailInput = page.locator("input[type='email']");
      await emailInput.fill("test@example.com");

      const resendBtn = page.locator(
        "button:has-text('Resend Verification Email')",
      );
      await expect(resendBtn).not.toBeDisabled();
    });

    test("submitting resend form shows feedback", async ({ page }) => {
      await page.goto("/verify-email");
      const emailInput = page.locator("input[type='email']");
      await emailInput.fill("e2e@vulnscan.dev");

      await page
        .locator("button:has-text('Resend Verification Email')")
        .click();

      const feedback = page.locator(
        "text=/Verification email resent|Too many attempts/",
      );
      await expect(feedback).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe("invalid token — error state", () => {
    test("shows verification error for invalid token", async ({ page }) => {
      await page.goto("/verify-email?token=invalid-token-value");

      const errorOrFailed = page.locator(
        "text=/Verification failed|verification failed/i",
      );
      await expect(errorOrFailed).toBeVisible({ timeout: 15_000 });
    });

    test("Back to Login button visible in error state", async ({ page }) => {
      await page.goto("/verify-email?token=invalid-token-value");

      await expect(
        page.locator("a[href='/login']").locator("text=Back to Login"),
      ).toBeVisible({ timeout: 15_000 });
    });
  });
});
