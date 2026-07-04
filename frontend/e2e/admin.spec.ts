import { test, expect } from "@playwright/test";

test.describe("Admin — Redirects", () => {
  test("non-admin accessing /admin redirects to dashboard", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.waitForURL("/dashboard", { timeout: 15_000 });
    await expect(page.locator("h2:has-text('DASHBOARD')")).toBeVisible();
  });

  test("non-admin accessing /admin/users redirects to dashboard", async ({
    page,
  }) => {
    await page.goto("/admin/users");
    await page.waitForURL("/dashboard", { timeout: 15_000 });
  });

  test("non-admin accessing /admin/pricing redirects to dashboard", async ({
    page,
  }) => {
    await page.goto("/admin/pricing");
    await page.waitForURL("/dashboard", { timeout: 15_000 });
  });

  test("non-admin accessing /admin/users/:id redirects to dashboard", async ({
    page,
  }) => {
    await page.goto("/admin/users/1");
    await page.waitForURL("/dashboard", { timeout: 15_000 });
  });

  test("admin links not visible in sidebar for non-admin user", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.locator("aside")).toBeVisible();
    await expect(
      page.locator("aside").locator("a:has-text('Users')"),
    ).toHaveCount(0);
    await expect(
      page.locator("aside").locator("a:has-text('Pricing')"),
    ).toHaveCount(0);
  });
});
