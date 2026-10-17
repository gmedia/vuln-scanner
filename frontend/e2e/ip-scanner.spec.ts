import { test, expect } from "./fixtures";

test.describe("IP Scanner @scan", () => {
  test("loads IP scanner page with form", async ({ page }) => {
    await page.goto("/scan/ip");
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible();
    await expect(page.getByTestId("scan-target").locator("h3")).toBeVisible();
    await expect(
      page.locator('input[placeholder="192.168.1.1"]'),
    ).toBeVisible();
    await expect(page.locator('input[placeholder="1-1000"]')).toBeVisible();
    await expect(page.getByTestId("ip-scan-submit")).toBeVisible();
  });

  test("shows validation error for empty IP", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.getByTestId("ip-scan-submit").click();
    await expect(
      page.locator(
        '[data-testid="scan-error"][data-error-key="errIpRequired"]',
      ),
    ).toBeVisible();
  });

  test("shows validation error for invalid IP format", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("not-an-ip");
    await page.getByTestId("ip-scan-submit").click();
    await expect(
      page.locator('[data-testid="scan-error"][data-error-key="errIpFormat"]'),
    ).toBeVisible();
  });

  test("shows validation error for invalid port format", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("8.8.8.8");
    await page.locator('input[placeholder="1-1000"]').fill("abc");
    await page.getByTestId("ip-scan-submit").click();
  });

  test("successful scan navigates to scan detail", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="1-1000"]').fill("1-100");
    await page.getByTestId("ip-scan-submit").click();
    // Navigates to scan detail page
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible({
      timeout: 15_000,
    });
  });

  test("scan progress shows after submission", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="1-1000"]').fill("1-100");
    await page.getByTestId("ip-scan-submit").click();

    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("rescan-button")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Enter key submits the form", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="192.168.1.1"]').press("Enter");
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible({
      timeout: 15_000,
    });
  });

  test("back arrow navigates to dashboard", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator("a[href='/dashboard']").first().click();
    await expect(page).toHaveURL("/dashboard");
  });
});
