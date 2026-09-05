import { test, expect } from "./fixtures";

test.describe("AI gateway — Layer A smoke", () => {
  test("page loads heading; flag-off shows empty copy", async ({ page }) => {
    await page.goto("/ai");
    await expect(page.getByRole("heading", { name: "AI Gateway" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    const off = page.getByTestId("ai-feature-off");
    if (await off.isVisible()) {
      await expect(off).toContainText(/tidak diaktifkan|not enabled/i);
    }
  });
});
