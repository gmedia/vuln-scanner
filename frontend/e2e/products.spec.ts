import { test, expect } from "@playwright/test";

test.describe("Products hub @smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("lists the five products", async ({ page }) => {
    await page.goto("/products");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('[data-testid^="product-card-"]')).toHaveCount(5);
  });

  test("opens the Scan product page", async ({ page }) => {
    await page.goto("/products");

    await page
      .locator('[data-testid="product-card-scan"] a[href="/products/scan"]')
      .click();

    await expect(page).toHaveURL(/\/products\/scan$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Sinexis Scan",
    );
  });

  test("shows a 404 for an unknown product slug", async ({ page }) => {
    await page.goto("/products/not-a-product");

    await expect(page.getByText("404")).toBeVisible();
  });
});
