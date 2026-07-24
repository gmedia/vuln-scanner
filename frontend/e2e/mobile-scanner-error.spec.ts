import { test, expect } from "@playwright/test";

test.describe("Mobile Scanner Error States", () => {
  test("shows error for wrong file type on Android", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an apk"),
    });
    await expect(page.locator("text=/Invalid file type/i")).toBeVisible();
  });

  test("shows error for wrong file extension on iOS", async ({ page }) => {
    await page.goto("/scan/mobile");
    await page.locator("button:has-text('iOS (.ipa)')").click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk"),
    });
    await expect(page.locator("text=/Expected .ipa for iOS/i")).toBeVisible();
  });

  test("submit button disabled when no file selected", async ({ page }) => {
    await page.goto("/scan/mobile");
    await expect(
      page.locator('button:has-text("Start mobile scan")'),
    ).toBeDisabled();
  });

  test("clears file when switching platforms", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');

    // Upload an APK
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk content"),
    });
    await expect(page.locator("text=test_app.apk")).toBeVisible();

    // Switch to iOS — file should be cleared
    await page.locator("button:has-text('iOS (.ipa)')").click();
    await expect(page.locator("text=Drop .ipa file here")).toBeVisible();

    // Submit button should be disabled again
    await expect(
      page.locator('button:has-text("Start mobile scan")'),
    ).toBeDisabled();
  });

  test("shows error for APK without ZIP magic bytes", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("invalid apk without PK header"),
    });
    await page.locator('button:has-text("Start mobile scan")').click();

    // Backend rejects the invalid file (HTTP 400: "File must be a valid ZIP archive").
    // Now exposed via onError callback using error.response?.data?.detail.
    await expect(
      page.locator("text=/File must be a valid ZIP archive/i"),
    ).toBeVisible({ timeout: 15_000 });
  });
});
