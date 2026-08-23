import { test, expect } from "@playwright/test";

test.describe("Verify Email", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.describe("no token — resend form", () => {
    test("shows SINEXIS branding", async ({ page }) => {
      await page.goto("/verify-email");
      await expect(
        page.locator("span.font-mono").filter({ hasText: "SINE" }).first(),
      ).toBeVisible();
      await expect(
        page.locator("span.text-primary").filter({ hasText: "XIS" }).first(),
      ).toBeVisible();
    });

    test("shows Check Your Email card title", async ({ page }) => {
      await page.goto("/verify-email");
      await expect(page.locator("text=Periksa email Anda")).toBeVisible();
    });

    test("shows instructional text", async ({ page }) => {
      await page.goto("/verify-email");
      await expect(
        page.locator("text=Buka tautan yang kami kirim untuk verifikasi akun."),
      ).toBeVisible();
    });

    test("Back to Login button is visible", async ({ page }) => {
      await page.goto("/verify-email");
      await expect(
        page.locator("a[href='/login']").locator("text=Kembali ke masuk"),
      ).toBeVisible();
    });

    test("resend email input has correct placeholder", async ({ page }) => {
      await page.goto("/verify-email");
      const emailInput = page.locator("input[type='email']");
      await expect(emailInput).toHaveAttribute(
        "placeholder",
        "email pendaftaran Anda",
      );
    });

    test("resend button is enabled when email is filled", async ({ page }) => {
      await page.goto("/verify-email");
      const emailInput = page.locator("input[type='email']");
      await emailInput.fill("test@example.com");

      const resendBtn = page.locator(
        "button:has-text('Kirim ulang email verifikasi')",
      );
      await expect(resendBtn).not.toBeDisabled();
    });

    test("submitting resend form shows feedback", async ({ page }) => {
      await page.goto("/verify-email");
      const emailInput = page.locator("input[type='email']");
      await emailInput.fill(
        process.env.E2E_EMAIL?.trim() || "e2e@vulnscan.dev",
      );

      await page
        .locator("button:has-text('Kirim ulang email verifikasi')")
        .click();

      const feedback = page.locator(
        "text=/Email verifikasi dikirim ulang|Terlalu banyak percobaan/",
      );
      await expect(feedback).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe("invalid token — error state", () => {
    test("shows verification error for invalid token", async ({ page }) => {
      await page.goto("/verify-email?token=invalid-token-value");

      // Wait for loading to finish (XCircle icon appears only in error state)
      await expect(page.locator(".text-destructive").first()).toBeVisible({
        timeout: 15_000,
      });

      await expect(
        page.getByRole("heading", { name: /Verifikasi gagal/i }),
      ).toBeVisible();
    });

    test("Back to Login button visible in error state", async ({ page }) => {
      await page.goto("/verify-email?token=invalid-token-value");

      await expect(
        page.locator("a[href='/login']").locator("text=Kembali ke masuk"),
      ).toBeVisible({ timeout: 15_000 });
    });
  });
});
