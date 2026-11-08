import { test, expect } from "./fixtures";

test.describe("Admin — Access @admin", () => {
  test("admin accessing /admin loads admin dashboard", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("h2")).toBeVisible({ timeout: 15_000 });
  });

  test("admin accessing /admin/users loads user management", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await expect(page.locator("h2:has-text('Manajemen pengguna')")).toBeVisible(
      {
        timeout: 15_000,
      },
    );
  });

  test("admin accessing /admin/users/:id loads user detail", async ({
    page,
  }) => {
    await page.goto("/admin/users/1");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});
    await expect(page.locator("h2:has-text('Detail pengguna')")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("admin SKU page exposes the tier tab", async ({ page }) => {
    await page.goto("/admin/skus");
    await expect(page.getByTestId("sku-tab-pricing")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("sku-tab-tiers").click();
    await expect(page.getByTestId("sku-tier-table")).toBeVisible();
  });
  test("admin links visible in sidebar for admin user", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("aside")).toBeVisible();
    await expect(
      page.locator("aside").locator("a[href='/admin/users']"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("aside").locator("a[href='/admin/hpp']"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("aside").locator("a[href='/admin/simulator']"),
    ).toHaveCount(0);
  });

  test("admin HPP page exposes report and what-if tabs", async ({ page }) => {
    await page.goto("/admin/hpp");
    await expect(page.getByTestId("hpp-tab-report")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("hpp-tab-what-if").click();
    await expect(page.getByTestId("hpp-sim-table")).toBeVisible();
  });

  test("/admin/simulator redirects to the what-if tab", async ({ page }) => {
    await page.goto("/admin/simulator");
    await expect(page).toHaveURL(/\/admin\/hpp\?tab=what-if/);
    await expect(page.getByTestId("hpp-sim-table")).toBeVisible({
      timeout: 15_000,
    });
  });
});
