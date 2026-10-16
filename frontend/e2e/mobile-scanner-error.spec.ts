import { test, expect } from "./fixtures";

test.describe("Mobile Scanner Error States @scan", () => {
  test("shows error for wrong file type on Android", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an apk"),
    });
    await expect(
      page.locator(
        '[data-testid="scan-error"][data-error-key="errMobileAndroid"]',
      ),
    ).toBeVisible();
  });

  test("shows error for wrong file extension on iOS", async ({ page }) => {
    await page.goto("/scan/mobile");
    await page.getByTestId("platform-ios").click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk"),
    });
    await expect(
      page.locator('[data-testid="scan-error"][data-error-key="errMobileIos"]'),
    ).toBeVisible();
  });

  test("submit button disabled when no file selected", async ({ page }) => {
    await page.goto("/scan/mobile");
    await expect(page.getByTestId("mobile-scan-submit")).toBeDisabled();
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
    await expect(page.getByTestId("mobile-file-name")).toHaveText(
      "test_app.apk",
    );

    // Switch to iOS — file should be cleared
    await page.getByTestId("platform-ios").click();
    await expect(page.getByTestId("mobile-choose-file")).toBeVisible();
    await expect(page.getByTestId("mobile-file-name")).toHaveCount(0);

    // Submit button should be disabled again
    await expect(page.getByTestId("mobile-scan-submit")).toBeDisabled();
  });

  test("shows error for APK without ZIP magic bytes", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("invalid apk without PK header"),
    });
    await page.getByTestId("mobile-scan-submit").click();

    await expect(
      page.locator('[data-testid="scan-error"][data-error-key="server"]'),
    ).toBeVisible({ timeout: 15_000 });
  });
});
