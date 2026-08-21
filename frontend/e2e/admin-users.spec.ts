import { test, expect } from "./fixtures";
import { e2eEmail } from "./credentials";

test.describe("Admin — Users", () => {
  test("page loads with USER MANAGEMENT heading", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(
      page.locator("h2:has-text('Manajemen pengguna')"),
    ).toBeVisible();
  });

  test("USERS card title is visible", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.locator("text=Pengguna").first()).toBeVisible();
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
    await expect(page.locator("th:has-text('Peran')")).toBeVisible();
    await expect(page.locator("th:has-text('Verifikasi')")).toBeVisible();
    await expect(page.locator("th:has-text('Kredit')")).toBeVisible();
    await expect(page.locator("th:has-text('Scan')")).toBeVisible();
    await expect(page.locator("th:has-text('Dibuat')")).toBeVisible();
    await expect(page.locator("th:has-text('Aksi')")).toBeVisible();
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
      page.locator("table").locator(`text=${e2eEmail()}`),
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
        has: page.locator(`text=${e2eEmail()}`),
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

    const searchInput = page.locator("input[placeholder='Cari email...']");
    const needle = e2eEmail();
    const localPart = needle.split("@")[0] ?? needle;
    await searchInput.fill(localPart);
    await expect(page.locator("table").locator(`text=${needle}`)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("search with no results shows empty state", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const searchInput = page.locator("input[placeholder='Cari email...']");
    await searchInput.fill("nonexistent-user-xyz");
    await page.waitForTimeout(500);

    await expect(page.locator("text=Pengguna tidak ditemukan")).toBeVisible();
  });

  test("clicking View navigates to user detail page", async ({ page }) => {
    await page.goto("/admin/users");
    await page
      .waitForSelector("[data-slot='skeleton']", {
        state: "hidden",
        timeout: 15_000,
      })
      .catch(() => {});

    const viewBtn = page.locator("button:has-text('Lihat')").first();
    await viewBtn.click({ force: true });
    await page.waitForURL(/\/admin\/users\/[a-f0-9-]+/, { timeout: 15_000 });
    await expect(page.locator("h2:has-text('Detail pengguna')")).toBeVisible();
  });
});
