import { test, expect } from "@playwright/test";

test.describe("Profile", () => {
  test("profile page renders correctly", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await expect(page.locator("input#profile-email")).toBeVisible();
    await expect(page.locator("input#profile-password")).toBeVisible();
    await expect(page.locator("text=Current email")).toBeVisible();
  });

  test("profile page shows change password form", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("input#current-password")).toBeVisible();
    await expect(page.locator("input#new-password")).toBeVisible();
    await expect(page.locator("input#confirm-password")).toBeVisible();
    await expect(
      page.locator("button:has-text('Change password')"),
    ).toBeVisible();
  });

  test("change password with empty fields shows browser validation", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.locator("button:has-text('Change password')").click();
    await expect(page.locator("input#current-password:invalid")).toBeVisible();
  });

  test("profile page shows sidebar", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("aside")).toBeVisible();
    await expect(
      page.locator("aside").locator("a:has-text('Dashboard')").first(),
    ).toBeVisible();
  });
});
