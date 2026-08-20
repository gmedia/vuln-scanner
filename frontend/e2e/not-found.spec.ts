import { test, expect } from "./fixtures";

test.describe("404 Page (authenticated)", () => {
  test("shows 404 page for unknown route", async ({ page }) => {
    await page.goto("/some/nonexistent/route");
    await expect(page.locator("text=404")).toBeVisible();
    await expect(page.locator("text=Halaman tidak ditemukan")).toBeVisible();
  });

  test("404 page has return button", async ({ page }) => {
    await page.goto("/random-unknown-path");
    await expect(page.locator("text=404")).toBeVisible();
    await expect(
      page.locator('a[href="/dashboard"]:has-text("Kembali ke dasbor")'),
    ).toBeVisible();
  });

  test("return button navigates to dashboard", async ({ page }) => {
    await page.goto("/random-path");
    await expect(page.locator("text=404")).toBeVisible();
    await page.locator('a:has-text("Kembali ke dasbor")').click();
    await expect(page).toHaveURL("/dashboard");
  });
});

test.describe("404 Page (guest)", () => {
  test.use({ storageState: { cookies: [], origins: [] }, skipAuth: true });

  test("guest sees home and sign in CTAs", async ({ page }) => {
    await page.goto("/guest-unknown-path");
    await expect(page.locator("text=404")).toBeVisible();
    await expect(
      page.locator('a[href="/"]:has-text("Kembali ke beranda")'),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/login"]:has-text("Masuk")'),
    ).toBeVisible();
    await expect(page.locator('a:has-text("Kembali ke dasbor")')).toHaveCount(
      0,
    );
  });
});
