import { test, expect } from "./fixtures";

test.describe("Profile @shell", () => {
  test("profile page renders correctly", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator('[data-slot="page-header"] h2')).toBeVisible();
    await expect(page.locator("input#profile-email")).toBeVisible();
    await expect(page.locator("input#profile-password")).toBeVisible();
    await expect(page.getByTestId("profile-current-email")).toBeVisible();
    await expect(page.getByTestId("profile-identity")).toBeVisible();
    await expect(page.getByTestId("profile-kpis")).toBeVisible();
  });

  test("profile page shows change password form", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("input#current-password")).toBeVisible();
    await expect(page.locator("input#new-password")).toBeVisible();
    await expect(page.locator("input#confirm-password")).toBeVisible();
    await expect(page.getByTestId("profile-password-submit")).toBeVisible();
  });

  test("change password with empty fields shows browser validation", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.getByTestId("profile-password-submit").click();
    await expect(page.locator("input#current-password:invalid")).toBeVisible();
  });

  test("profile page shows sidebar", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("aside")).toBeVisible();
    await expect(
      page.locator("aside a[href='/dashboard']").first(),
    ).toBeVisible();
  });
});
