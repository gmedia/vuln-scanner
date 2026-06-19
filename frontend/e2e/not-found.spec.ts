import { test, expect } from "@playwright/test";

test.describe("404 Page", () => {
  test("shows 404 page for unknown route", async ({ page }) => {
    await page.goto("/some/nonexistent/route");
    await expect(page.locator("text=404")).toBeVisible();
    await expect(page.locator("text=PAGE NOT FOUND")).toBeVisible();
  });

  test("404 page has return button", async ({ page }) => {
    await page.goto("/random-unknown-path");
    await expect(page.locator("text=404")).toBeVisible();
    await expect(page.locator('a[href="/"]:has-text("Dashboard")')).toBeVisible();
  });

  test("return button navigates to dashboard", async ({ page }) => {
    await page.goto("/random-path");
    await expect(page.locator("text=404")).toBeVisible();
    await page.locator('a:has-text("Return to Dashboard")').click();
    await expect(page).toHaveURL("/");
  });
});
