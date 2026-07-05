import { test, expect } from "@playwright/test";

test.describe("Admin — Access", () => {
  test("admin accessing /admin loads admin dashboard", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("h2")).toBeVisible({ timeout: 15_000 });
  });

  test("admin accessing /admin/users loads user management", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await expect(page.locator("h2:has-text('USER MANAGEMENT')")).toBeVisible({
      timeout: 15_000,
    });
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
    await expect(page.locator("h2:has-text('USER DETAILS')")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("admin links visible in sidebar for admin user", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("aside")).toBeVisible();
    await expect(
      page.locator("aside").locator("a:has-text('Users')"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("aside").locator("a:has-text('Pricing')"),
    ).toBeVisible({ timeout: 10_000 });
  });
});
