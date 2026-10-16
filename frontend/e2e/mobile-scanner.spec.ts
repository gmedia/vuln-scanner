import { test, expect } from "./fixtures";
import path from "path";

test.describe("Mobile Scanner @scan", () => {
  test("loads mobile scanner page with upload area", async ({ page }) => {
    await page.goto("/scan/mobile");
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible();
    await expect(page.getByTestId("scan-target").locator("h3")).toBeVisible();
    await expect(page.getByTestId("mobile-choose-file")).toBeVisible();
    await expect(page.getByTestId("mobile-drop-hint")).toBeVisible();
    await expect(page.getByTestId("mobile-drop-hint")).toContainText("500MB");
    await expect(page.getByTestId("mobile-browse")).toBeVisible();
    await expect(page.getByTestId("mobile-scan-submit")).toBeVisible();
  });

  test("shows platform toggle buttons", async ({ page }) => {
    await page.goto("/scan/mobile");
    await expect(page.getByTestId("platform-android")).toBeVisible();
    await expect(page.getByTestId("platform-ios")).toBeVisible();
  });

  test("switching platform resets file and changes upload text", async ({
    page,
  }) => {
    await page.goto("/scan/mobile");
    const choose = page.getByTestId("mobile-choose-file");
    await expect(choose).toBeVisible();
    const before = await choose.textContent();
    await page.getByTestId("platform-ios").click();
    await expect(choose).toBeVisible();
    expect(await choose.textContent()).not.toBe(before);
    await page.getByTestId("platform-android").click();
    expect(await choose.textContent()).toBe(before);
  });

  test("submit button disabled when no file selected", async ({ page }) => {
    await page.goto("/scan/mobile");
    await expect(page.getByTestId("mobile-scan-submit")).toBeDisabled();
  });

  test("shows error for wrong file type", async ({ page }) => {
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

  test("shows error for wrong iOS file type", async ({ page }) => {
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

  test("displays selected file info", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk content here"),
    });
    await expect(page.getByTestId("mobile-file-name")).toHaveText(
      "test_app.apk",
    );
    await expect(page.getByTestId("mobile-file-meta")).toContainText(".APK");
  });

  test("clear file button works", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk content here"),
    });
    await expect(page.getByTestId("mobile-file-name")).toHaveText(
      "test_app.apk",
    );
    const clearBtn = page.getByTestId("mobile-clear-file");
    await clearBtn.click();
    await expect(page.getByTestId("mobile-choose-file")).toBeVisible();
    await expect(page.getByTestId("mobile-file-name")).toHaveCount(0);
  });

  test("accepts .aab file selection on Android", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute("accept", ".apk,.aab");
    await fileInput.setInputFiles({
      name: "app.aab",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("PK\x03\x04fake aab content"),
    });
    await expect(page.getByTestId("mobile-file-name")).toHaveText("app.aab");
    await expect(page.getByTestId("mobile-file-meta")).toContainText(".AAB");
  });

  test("successful mobile scan navigates to scan detail", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("PK\x03\x04fake apk content here"),
    });
    await page.getByTestId("mobile-scan-submit").click();
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
  });

  test("submit button disabled until file selected", async ({ page }) => {
    await page.goto("/scan/mobile");
    const button = page.getByTestId("mobile-scan-submit");
    await expect(button).toBeDisabled();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk"),
    });
    await expect(button).not.toBeDisabled();
  });
});
