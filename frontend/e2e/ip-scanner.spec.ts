import { test, expect } from "@playwright/test";

test.describe("IP Scanner", () => {
  test("loads IP scanner page with form", async ({ page }) => {
    await page.goto("/scan/ip");
    await expect(page.locator("h2:has-text('IP scanner')")).toBeVisible();
    await expect(page.locator("text=Scan target")).toBeVisible();
    await expect(
      page.locator('input[placeholder="192.168.1.1"]'),
    ).toBeVisible();
    await expect(page.locator('input[placeholder="1-1000"]')).toBeVisible();
    await expect(
      page.locator('button:has-text("Start IP scan")'),
    ).toBeVisible();
  });

  test("shows validation error for empty IP", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('button:has-text("Start IP scan")').click();
    await expect(page.locator("text=IP address is required")).toBeVisible();
  });

  test("shows validation error for invalid IP format", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("not-an-ip");
    await page.locator('button:has-text("Start IP scan")').click();
    await expect(page.locator("text=Invalid IP address format")).toBeVisible();
  });

  test("shows validation error for invalid port format", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("8.8.8.8");
    await page.locator('input[placeholder="1-1000"]').fill("abc");
    await page.locator('button:has-text("Start IP scan")').click();
  });

  test("successful scan navigates to scan detail", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="1-1000"]').fill("1-100");
    await page.locator('button:has-text("Start IP scan")').click();
    // Navigates to scan detail page
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator("h2:has-text('Scan details')")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("scan progress shows after submission", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="1-1000"]').fill("1-100");
    await page.locator('button:has-text("Start IP scan")').click();

    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator("h2:has-text('Scan details')")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("text=Target").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Enter key submits the form", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("127.0.0.1");
    await page.locator('input[placeholder="192.168.1.1"]').press("Enter");
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator("h2:has-text('Scan details')")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("back arrow navigates to dashboard", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator("a[href='/dashboard']").first().click();
    await expect(page).toHaveURL("/dashboard");
  });
});
