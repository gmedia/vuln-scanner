import { test, expect } from "@playwright/test";

test.describe("Form feedback — backend validation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login renders a server 422 under the rejected field", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("input#email").fill("e2e-valid@example.com");
    await page.locator("input#password").fill("short");
    await page.locator("button[type='submit']").click();

    const password = page.locator("input#password");
    await expect(password).toHaveAttribute("aria-invalid", "true", {
      timeout: 15_000,
    });
    await expect(page.locator("#login-password-error")).toBeVisible();
    await expect(page.locator("#login-password-error")).not.toBeEmpty();
    await expect(password).toBeFocused();
  });
});
