import { test, expect } from "./fixtures";

test.describe("IP Scanner Error States @scan", () => {
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

  test("shows error for invalid port format", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("8.8.8.8");
    await page.locator('input[placeholder="1-1000"]').fill("abc");
    await page.getByTestId("ip-scan-submit").click();
    await expect(
      page.locator('[data-testid="scan-error"][data-error-key="errIpPorts"]'),
    ).toBeVisible();
  });

  test("shows error when IP scan fails to start", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("0.0.0.0");
    await page.locator('input[placeholder="1-1000"]').fill("1-100");
    await page.getByTestId("ip-scan-submit").click();
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator("h2:has-text('Detail scan')")).toBeVisible({
      timeout: 15_000,
    });
  });
});
