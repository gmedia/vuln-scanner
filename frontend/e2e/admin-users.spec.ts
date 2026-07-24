import { test, expect } from "@playwright/test";

test.describe("Admin — Users", () => {
  test("page loads with USER MANAGEMENT heading", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.locator("h2:has-text('User management')")).toBeVisible();
  });

  test("USERS card title is visible", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.locator("text=Users").first()).toBeVisible();
  });

  test("table headers are correct", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(page.locator("th:has-text('Email')")).toBeVisible();
    await expect(page.locator("th:has-text('Role')")).toBeVisible();
    await expect(page.locator("th:has-text('Verified')")).toBeVisible();
    await expect(page.locator("th:has-text('Credits')")).toBeVisible();
    await expect(page.locator("th:has-text('Scans')")).toBeVisible();
    await expect(page.locator("th:has-text('Created')")).toBeVisible();
    await expect(page.locator("th:has-text('Actions')")).toBeVisible();
  });

  test("user rows are visible in table", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();
  });

  test("shows seeded admin user", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(
      page.locator("table").locator("text=e2e@vulnscan.dev"),
    ).toBeVisible();
  });

  test("admin badge shows Yes for admin user", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const adminBadge = page
      .locator("table tbody tr", {
        has: page.locator("text=e2e@vulnscan.dev"),
      })
      .locator("td span:has-text('Admin')")
      .first();
    await expect(adminBadge).toBeVisible();
  });

  test("total count badge is visible", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    await expect(page.locator("text=/\\d+ total/")).toBeVisible();
  });

  test("search input filters users", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const searchInput = page.locator("input[placeholder='Search email...']");
    await searchInput.fill("e2e");
    await page.waitForTimeout(500);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);
    await expect(
      page.locator("table").locator("text=e2e@vulnscan.dev"),
    ).toBeVisible();
  });

  test("search with no results shows empty state", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const searchInput = page.locator("input[placeholder='Search email...']");
    await searchInput.fill("nonexistent-user-xyz");
    await page.waitForTimeout(500);

    await expect(page.locator("text=No users found")).toBeVisible();
  });

  test("clicking View navigates to user detail page", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const viewBtn = page.locator("button:has-text('View')").first();
    await viewBtn.click({ force: true });
    await page.waitForURL(/\/admin\/users\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(page.locator("h2:has-text('User details')")).toBeVisible();
  });
});
