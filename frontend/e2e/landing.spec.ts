import { test, expect } from "@playwright/test";

test.describe("Landing", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("page loads with Sinexis heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1:has-text('Sinexis')")).toBeVisible();
    await expect(
      page
        .locator(
          "text=Security attach untuk colo, VPS, dan tumpukan hospitality",
        )
        .first(),
    ).toBeVisible();
  });

  test("shows attach-loop tagline", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator("text=Temukan paparan di IP, domain, dan mobile"),
    ).toBeVisible();
    await expect(
      page.locator("text=powered by the VulnScanner engine"),
    ).toHaveCount(0);
  });

  test("Get Started button links to register", async ({ page }) => {
    await page.goto("/");
    const getStartedLink = page.locator("a[href='/register']").first();
    await expect(getStartedLink).toBeVisible();
    await expect(getStartedLink.locator("text=Mulai")).toBeVisible();
  });

  test("Sign In button links to login", async ({ page }) => {
    await page.goto("/");
    const signInLink = page.locator("a[href='/login']").first();
    await expect(signInLink).toBeVisible();
    await expect(signInLink.locator("text=Masuk")).toBeVisible();
  });

  test("What ships section heading is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h2:has-text('Yang tersedia')")).toBeVisible();
  });

  test("renders IP scan feature card", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Scan IP")).toBeVisible();
    await expect(
      page.locator(
        "text=Port, layanan, dan tingkat keparahan CVE pada host yang sudah Anda jalankan.",
      ),
    ).toBeVisible();
  });

  test("renders Guard and SIEM cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Guard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "SIEM" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Scan Attach" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kredit" })).toBeVisible();
  });

  test("footer shows platform line without engine dump", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toContainText(
      "Sinexis · Scan · Guard · SIEM",
    );
    await expect(page.locator("footer")).not.toContainText("VulnScanner");
  });
});
