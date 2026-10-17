import { test, expect } from "./fixtures";

test.describe("Domain Scanner @scan", () => {
  test("loads domain scanner page with form", async ({ page }) => {
    await page.goto("/scan/domain");
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible();
    await expect(page.getByTestId("scan-target").locator("h3")).toBeVisible();
    await expect(
      page.locator('input[placeholder="example.com"]'),
    ).toBeVisible();
    await expect(page.getByTestId("domain-scan-submit")).toBeVisible();
  });

  test("shows validation error for empty domain", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.getByTestId("domain-scan-submit").click();
    await expect(
      page.locator(
        '[data-testid="scan-error"][data-error-key="errDomainRequired"]',
      ),
    ).toBeVisible();
  });

  test("shows validation error for invalid domain format", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.locator('input[placeholder="example.com"]').fill("not-a-domain");
    await page.getByTestId("domain-scan-submit").click();
    await expect(
      page.locator(
        '[data-testid="scan-error"][data-error-key="errDomainFormat"]',
      ),
    ).toBeVisible();
  });

  test("successful domain scan navigates to scan detail", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.locator('input[placeholder="example.com"]').fill("example.com");
    await page.getByTestId("domain-scan-submit").click();
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Enter key submits the form", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.locator('input[placeholder="example.com"]').fill("example.com");
    await page.locator('input[placeholder="example.com"]').press("Enter");
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible({
      timeout: 15_000,
    });
  });

  test("back arrow navigates to dashboard", async ({ page }) => {
    await page.goto("/scan/domain");
    await page.locator("a[href='/dashboard']").first().click();
    await expect(page).toHaveURL("/dashboard");
  });
});
