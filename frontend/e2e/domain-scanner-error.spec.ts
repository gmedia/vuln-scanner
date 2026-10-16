import { test, expect } from "./fixtures";

test.describe("Domain Scanner Error States @scan", () => {
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

  test("shows error when domain scan fails due to unreachable domain", async ({
    page,
  }) => {
    await page.goto("/scan/domain");
    await page
      .locator('input[placeholder="example.com"]')
      .fill("this-domain-definitely-does-not-exist-12345.com");
    await page.getByTestId("domain-scan-submit").click();
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator("h2:has-text('Detail scan')")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("shows error for domain with invalid characters", async ({ page }) => {
    await page.goto("/scan/domain");
    await page
      .locator('input[placeholder="example.com"]')
      .fill("invalid domain with spaces");
    await page.getByTestId("domain-scan-submit").click();
    await expect(
      page.locator(
        '[data-testid="scan-error"][data-error-key="errDomainFormat"]',
      ),
    ).toBeVisible();
  });
});
