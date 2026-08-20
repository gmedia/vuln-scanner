import { test, expect } from "./fixtures";

test.describe("Dashboard", () => {
  test("loads and shows all UI elements", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h2:has-text('Ringkasan')")).toBeVisible();
    await expect(page.locator("text=SINEXIS").first()).toBeVisible();
    await expect(page.locator("text=Risiko terbuka")).toBeVisible();
    await expect(page.locator("text=Jadwal").first()).toBeVisible();
    await expect(page.locator("text=Kredit").first()).toBeVisible();
  });

  test("shows Scan baru menu links", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("new-scan-cta").click();
    await expect(page.getByRole("menuitem", { name: "Scan IP" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Scan domain" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Scan mobile" }),
    ).toBeVisible();
  });

  test("navigates to IP scanner via Scan baru", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("new-scan-cta").click();
    await page.getByRole("menuitem", { name: "Scan IP" }).click();
    await expect(page).toHaveURL("/scan/ip");
    await expect(page.locator("h2:has-text('IP scanner')")).toBeVisible();
  });

  test("navigates to Domain scanner via Scan baru", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("new-scan-cta").click();
    await page.getByRole("menuitem", { name: "Scan domain" }).click();
    await expect(page).toHaveURL("/scan/domain");
    await expect(page.locator("h2:has-text('Domain scanner')")).toBeVisible();
  });

  test("navigates to Mobile scanner via Scan baru", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("new-scan-cta").click();
    await page.getByRole("menuitem", { name: "Scan mobile" }).click();
    await expect(page).toHaveURL("/scan/mobile");
    await expect(page.locator("h2:has-text('Mobile scanner')")).toBeVisible();
  });

  test("shows scan history list when scans exist", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForSelector("a[href^='/scan/']", { timeout: 15_000 });
    const scanCount = await page.locator("a[href^='/scan/']").count();
    expect(scanCount).toBeGreaterThan(0);
  });

  test("clicking a scan history item navigates to scan detail", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForSelector("a[href^='/scan/']", { timeout: 15_000 });
    const firstScan = page.locator("main a[href^='/scan/']").first();
    const href = await firstScan.getAttribute("href");
    await firstScan.click();
    await expect(page).toHaveURL(href!);
  });

  test("sidebar navigation shows all links", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("aside")).toBeVisible();
    await expect(
      page.locator("aside").locator("a:has-text('Dasbor')").first(),
    ).toBeVisible();
    await expect(
      page.locator("aside").locator("a:has-text('Scanner IP')"),
    ).toBeVisible();
    await expect(
      page.locator("aside").locator("a:has-text('Scanner domain')"),
    ).toBeVisible();
    await expect(
      page.locator("aside").locator("a:has-text('Scanner mobile')"),
    ).toBeVisible();
  });

  test("sidebar nav items navigate to correct pages", async ({ page }) => {
    await page.goto("/dashboard");
    await page.locator("aside").locator("a:has-text('Scanner IP')").click();
    await expect(page).toHaveURL("/scan/ip");

    await page.locator("aside").locator("a:has-text('Scanner domain')").click();
    await expect(page).toHaveURL("/scan/domain");

    await page.locator("aside").locator("a:has-text('Scanner mobile')").click();
    await expect(page).toHaveURL("/scan/mobile");

    await page.locator("aside").locator("a:has-text('Dasbor')").first().click();
    await expect(page).toHaveURL("/dashboard");
  });
});
