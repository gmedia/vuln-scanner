import { test, expect } from "@playwright/test";

test.describe("Landing", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("page loads with Sinexis heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1:has-text('Sinexis')")).toBeVisible();
    await expect(
      page
        .locator("text=Security attach for colo, VPS, and hospitality stacks")
        .first(),
    ).toBeVisible();
  });

  test("shows attach-loop tagline", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator("text=Find exposure on IP, domain, and mobile"),
    ).toBeVisible();
    await expect(
      page.locator("text=powered by the VulnScanner engine"),
    ).toHaveCount(0);
  });

  test("Get Started button links to register", async ({ page }) => {
    await page.goto("/");
    const getStartedLink = page.locator("a[href='/register']").first();
    await expect(getStartedLink).toBeVisible();
    await expect(getStartedLink.locator("text=Get Started")).toBeVisible();
  });

  test("Sign In button links to login", async ({ page }) => {
    await page.goto("/");
    const signInLink = page.locator("a[href='/login']").first();
    await expect(signInLink).toBeVisible();
    await expect(signInLink.locator("text=Sign In")).toBeVisible();
  });

  test("What ships section heading is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h2:has-text('What ships')")).toBeVisible();
  });

  test("renders IP scan feature card", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=IP scan")).toBeVisible();
    await expect(
      page.locator(
        "text=Ports, services, and CVE severity on the hosts you already run.",
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
    await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  });

  test("footer shows platform line without engine dump", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toContainText(
      "Sinexis · Scan · Guard · SIEM",
    );
    await expect(page.locator("footer")).not.toContainText("VulnScanner");
  });
});
