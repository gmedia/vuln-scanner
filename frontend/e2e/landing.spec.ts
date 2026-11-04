import { test, expect } from "@playwright/test";

test.describe("Landing @smoke @shell", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("page loads with the umbrella heading", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator(
        "h1:has-text('Kelola server yang sudah Anda bayar. Lihat dari luar dan dari dalam mesin.')",
      ),
    ).toBeVisible();
    await expect(
      page.locator("text=Security dan operasi yang menempel").first(),
    ).toBeVisible();
  });

  test("hero attach loop shows Connect, Watch, Prove", async ({ page }) => {
    await page.goto("/");
    const loop = page.getByTestId("landing-loop");
    await expect(loop).toContainText("Hubungkan");
    await expect(loop).toContainText("Pantau");
    await expect(loop).toContainText("Buktikan");
    await expect(loop.locator("svg")).toHaveCount(2);
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

  test("umbrella sections are visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h2:has-text('Empat permukaan')")).toBeVisible();
    await expect(page.locator("h2:has-text('Cara menempelnya')")).toBeVisible();
    await expect(page.locator("h2:has-text('Jawaban langsung')")).toBeVisible();
  });

  test("renders exactly four pillar cards", async ({ page }) => {
    await page.goto("/");
    const cards = page.getByTestId("pillar-card");
    await expect(cards).toHaveCount(4);
    await expect(
      page.getByRole("heading", { name: "Paparan", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Keamanan on-box", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Ketersediaan", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "AI", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "SIEM", exact: true }),
    ).toHaveCount(0);
  });

  test("Products appears in the header and the footer", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator("header a[href='/products']").first(),
    ).toBeVisible();
    await expect(
      page.locator("footer a[href='/products']").first(),
    ).toBeVisible();
  });

  test("mobile sheet repeats the Products link", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.locator("header button[aria-label='Menu']").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: "Produk" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Blog" })).toBeVisible();
  });

  test("footer shows the umbrella line without engine dump", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("footer")).toContainText(
      "Sinexis · Security & operations attach",
    );
    await expect(page.locator("footer")).not.toContainText("SIEM");
    await expect(page.locator("footer")).not.toContainText("VulnScanner");
  });

  test("English locale shows the umbrella copy", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("sinexis.locale", "en");
    });
    await page.goto("/");
    await expect(
      page.locator(
        "h1:has-text('Run the servers you already pay for. See them from the outside and from the box.')",
      ),
    ).toBeVisible();
    await expect(page.locator("h2:has-text('Four surfaces')")).toBeVisible();
    await expect(
      page.locator("header a[href='/products']").first(),
    ).toContainText("Products");
  });
});
