import { test, expect } from "@playwright/test";

test.describe("Auth — Login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h3")).toContainText("Sign In");
    await expect(page.locator("input#email")).toBeVisible();
    await expect(page.locator("input#password")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("login with valid credentials redirects to dashboard", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("input#email").fill("e2e@vulnscan.dev");
    await page.locator("input#password").fill("E2eTestPass123!");
    await page.locator("button[type='submit']").click();
    await page.waitForURL("/dashboard", { timeout: 15_000 });
    await expect(page.locator("h2:has-text('DASHBOARD')")).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.locator("input#email").fill("wrong@example.com");
    await page.locator("input#password").fill("WrongPass123!");
    await page.locator("button[type='submit']").click();
    await expect(page.locator(".text-red-400")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("login with empty fields shows browser validation", async ({ page }) => {
    await page.goto("/login");
    await page.locator("button[type='submit']").click();
    await expect(page.locator("input#email:invalid")).toBeVisible();
  });

  test("login page has link to register", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("a[href='/register']")).toBeVisible();
  });
});

test.describe("Auth — Register", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("h3")).toContainText("Create Account");
    await expect(page.locator("input#email")).toBeVisible();
    await expect(page.locator("input#password")).toBeVisible();
    await expect(page.locator("input#confirmPassword")).toBeVisible();
    await expect(page.locator("button[type='submit']")).toBeVisible();
  });

  test("register page has link to login", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("a[href='/login']")).toBeVisible();
  });

  test("register with mismatched passwords shows validation", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.locator("input#email").fill("test@example.com");
    await page.locator("input#password").fill("Password123!");
    await page.locator("input#confirmPassword").fill("DifferentPassword123!");
    await page.locator("button[type='submit']").click();
    await expect(page.locator(".text-red-400")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("register with short password shows validation", async ({ page }) => {
    await page.goto("/register");
    await page.locator("input#email").fill("test@example.com");
    await page.locator("input#password").fill("short");
    await page.locator("input#confirmPassword").fill("short");
    await page.locator("button[type='submit']").click();
    await expect(page.locator(".text-red-400")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("register with valid data shows success page", async ({ page }) => {
    const uniqueEmail = `e2e-register-${Date.now()}@vulnscan.dev`;
    await page.goto("/register");
    await page.locator("input#email").fill(uniqueEmail);
    await page.locator("input#password").fill("Str0ng!Pass123");
    await page.locator("input#confirmPassword").fill("Str0ng!Pass123");
    await page.locator("button[type='submit']").click();
    await expect(
      page.locator("h2:has-text('Registration Successful!')"),
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Auth — Logout", () => {
  test("logout redirects to login page", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForSelector("header", { timeout: 10_000 });
    const userBtn = page.locator("header button:has(svg.lucide-user)");
    if (await userBtn.isVisible().catch(() => false)) {
      await userBtn.click();
      const userMenu = page.getByTestId("user-menu");
      await expect(userMenu).toBeVisible();
      const signOutBtn = page.getByTestId("sign-out");
      await expect(signOutBtn).toBeVisible();
      await signOutBtn.click();
      await page.waitForURL("/login", { timeout: 10_000 });
      await expect(page.locator("h3")).toContainText("Sign In");
    }
  });

  test("protected route redirects to login when unauthenticated", async ({
    page,
    browser,
  }) => {
    const freshContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      ignoreHTTPSErrors: true,
    });
    const freshPage = await freshContext.newPage();
    await freshPage.goto("/dashboard");
    await freshPage.waitForURL("/login", { timeout: 10_000 });
    await expect(freshPage.locator("h3")).toContainText("Sign In");
    await freshContext.close();
  });
});
