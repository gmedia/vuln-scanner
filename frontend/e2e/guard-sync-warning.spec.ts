import { test, expect } from "./fixtures";

test.describe("Form feedback — Guard ok:false", () => {
  test("sync with ok:false shows a warning, never a success toast", async ({
    page,
  }) => {
    await page.route("**/api/guard/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          wazuh_group: null,
          last_inventory_sync_at: null,
          last_alert_sync_at: null,
          last_sync_error: null,
          degraded: false,
        }),
      }),
    );
    await page.route("**/api/guard/agents", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/guard/alerts**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/guard/enroll-tokens", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/assets**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.route("**/api/guard/sync", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "not_enabled" }),
      }),
    );

    await page.goto("/guard");
    await expect(page.getByTestId("guard-state")).toHaveAttribute(
      "data-enabled",
      "true",
      { timeout: 20_000 },
    );
    await page.getByTestId("guard-sync").click();

    await expect(
      page.getByText(/Guard belum diaktifkan|Guard is not enabled/),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Sinkronisasi selesai|Sync finished/),
    ).toHaveCount(0);
  });
});
