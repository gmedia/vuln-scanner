import { test, expect } from "@playwright/test";

test.describe("Landing", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("page loads with outcome heading", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator(
        "h1:has-text('Cek paparan IP, domain, dan mobile — lalu jadwalkan')",
      ),
    ).toBeVisible();
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
      page.locator("text=Kredit, workspace, aset, Guard, dan uptime"),
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

  test("What you can use today heading is visible", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator("h2:has-text('Yang bisa dipakai hari ini')"),
    ).toBeVisible();
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

  test("renders Guard, Assets, Uptime cards without SIEM as shipped", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Guard", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Aset", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Uptime", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Scan Attach", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Kredit", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "SIEM", exact: true }),
    ).toHaveCount(0);
  });

  test("footer shows platform line without engine dump", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toContainText(
      "Sinexis · Scan · Guard · SIEM",
    );
    await expect(page.locator("footer")).not.toContainText("VulnScanner");
  });
});
