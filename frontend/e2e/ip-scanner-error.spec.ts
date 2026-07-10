import { test, expect } from "@playwright/test";

test.describe("IP Scanner Error States", () => {
  test("shows validation error for empty IP", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('button:has-text("START IP SCAN")').click();
    await expect(page.locator("text=IP address is required")).toBeVisible();
  });

  test("shows validation error for invalid IP format", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("not-an-ip");
    await page.locator('button:has-text("START IP SCAN")').click();
    await expect(page.locator("text=Invalid IP address format")).toBeVisible();
  });

  test("shows error for invalid port format", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("8.8.8.8");
    await page.locator('input[placeholder="1-1000"]').fill("abc");
    await page.locator('button:has-text("START IP SCAN")').click();
    await expect(page.locator("text=/Invalid port format/i")).toBeVisible();
  });

  test("shows error when IP scan fails to start", async ({ page }) => {
    await page.goto("/scan/ip");
    await page.locator('input[placeholder="192.168.1.1"]').fill("0.0.0.0");
    await page.locator('input[placeholder="1-1000"]').fill("1-100");
    await page.locator('button:has-text("START IP SCAN")').click();
    await expect(page).toHaveURL(/\/scan\/(?!ip$|domain$|mobile$)/, {
      timeout: 15_000,
    });
    await expect(page.locator("h2:has-text('SCAN DETAILS')")).toBeVisible({
      timeout: 15_000,
    });
  });
});
