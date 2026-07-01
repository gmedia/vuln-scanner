import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Mobile Scanner", () => {
  test("loads mobile scanner page with upload area", async ({ page }) => {
    await page.goto("/scan/mobile");
    await expect(page.locator("h2:has-text('MOBILE SCANNER')")).toBeVisible();
    await expect(page.locator("text=UPLOAD BINARY")).toBeVisible();
    await expect(page.locator("text=Drop .apk file here")).toBeVisible();
    await expect(
      page.locator("text=or click to browse (max 500MB)"),
    ).toBeVisible();
    await expect(
      page.locator("button:has-text('START MOBILE SCAN')"),
    ).toBeVisible();
  });

  test("shows platform toggle buttons", async ({ page }) => {
    await page.goto("/scan/mobile");
    await expect(page.locator("text=Android (.apk)")).toBeVisible();
    await expect(page.locator("text=iOS (.ipa)")).toBeVisible();
  });

  test("switching platform resets file and changes upload text", async ({
    page,
  }) => {
    await page.goto("/scan/mobile");
    // Initially Android
    await expect(page.locator("text=Drop .apk file here")).toBeVisible();

    // Switch to iOS
    await page.locator("button:has-text('iOS (.ipa)')").click();
    await expect(page.locator("text=Drop .ipa file here")).toBeVisible();

    // Switch back
    await page.locator("button:has-text('Android (.apk)')").click();
    await expect(page.locator("text=Drop .apk file here")).toBeVisible();
  });

  test("submit button disabled when no file selected", async ({ page }) => {
    await page.goto("/scan/mobile");
    await expect(
      page.locator('button:has-text("START MOBILE SCAN")'),
    ).toBeDisabled();
  });

  test("shows error for wrong file type", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an apk"),
    });
    await expect(page.locator("text=Invalid file type")).toBeVisible();
  });

  test("shows error for wrong iOS file type", async ({ page }) => {
    await page.goto("/scan/mobile");
    await page.locator("button:has-text('iOS (.ipa)')").click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk"),
    });
    await expect(page.locator("text=Expected .ipa for iOS.")).toBeVisible();
  });

  test("displays selected file info", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk content here"),
    });
    await expect(page.locator("text=test_app.apk")).toBeVisible();
    await expect(page.locator("text=.APK").first()).toBeVisible();
  });

  test("clear file button works", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk content here"),
    });
    await expect(page.locator("text=test_app.apk")).toBeVisible();
    const clearBtn = page
      .locator("button")
      .filter({ has: page.locator("svg.lucide-x") })
      .last();
    await clearBtn.click();
    await expect(page.locator("text=Drop .apk file here")).toBeVisible();
  });

  test("successful mobile scan navigates to scan detail", async ({ page }) => {
    await page.goto("/scan/mobile");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test_app.apk",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("fake apk content here"),
    });
    await page.locator('button:has-text("START MOBILE SCAN")').click();
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
  });

  test("submit button disabled until file selected", async ({ page }) => {
    await page.goto("/scan/mobile");
    const button = page.locator('button:has-text("START MOBILE SCAN")');
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
