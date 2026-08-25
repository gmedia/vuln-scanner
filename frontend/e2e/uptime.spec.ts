import { test, expect } from "./fixtures";

function httpTarget(): string {
  return process.env.E2E_UPTIME_HTTP?.trim() || "https://example.com";
}

function tcpTarget(): string | undefined {
  const raw = process.env.E2E_UPTIME_TCP?.trim();
  return raw || undefined;
}

test.describe("Uptime", () => {
  test("sidebar links to Uptime and page loads", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("nav-uptime").click();
    await expect(page).toHaveURL(/\/uptime$/);
    await expect(page.getByTestId("uptime-page")).toBeVisible();
    await expect(page.getByTestId("uptime-add")).toBeVisible();
  });

  test("rejects private RFC1918 HTTP target", async ({ page }) => {
    await page.goto("/uptime");
    await page.getByTestId("uptime-add").click();
    await page.getByTestId("uptime-name").fill("e2e-ssrf");
    await page.getByTestId("uptime-target").fill("http://10.0.0.1/health");
    await page.getByTestId("uptime-save").click();
    await expect(page.getByText(/not allowed|tidak diizinkan/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("creates HTTP monitor against lab/public target then deletes", async ({
    page,
  }) => {
    const name = `e2e-up-${Date.now()}`;
    const target = httpTarget();
    await page.goto("/uptime");
    await page.getByTestId("uptime-add").click();
    await page.getByTestId("uptime-name").fill(name);
    await page.getByTestId("uptime-target").fill(target);
    await page.getByTestId("uptime-save").click();

    const row = page.locator('[data-testid="uptime-row"]').filter({
      hasText: name,
    });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(/http/i);
    await expect(row).toContainText(/unknown|up|down|degraded/i);

    page.once("dialog", (d) => d.accept());
    await row.getByTestId("uptime-delete").click();
    await expect(row).toHaveCount(0, { timeout: 20_000 });
  });

  test("creates TCP monitor when E2E_UPTIME_TCP is set", async ({ page }) => {
    const tcp = tcpTarget();
    test.skip(!tcp, "Set E2E_UPTIME_TCP=host:port for lab TCP probe");
    const name = `e2e-tcp-${Date.now()}`;
    await page.goto("/uptime");
    await page.getByTestId("uptime-add").click();
    await page.getByTestId("uptime-type").selectOption("tcp");
    await page.getByTestId("uptime-name").fill(name);
    await page.getByTestId("uptime-target").fill(tcp!);
    await page.getByTestId("uptime-save").click();
    const row = page.locator('[data-testid="uptime-row"]').filter({
      hasText: name,
    });
    await expect(row).toBeVisible({ timeout: 20_000 });
    page.once("dialog", (d) => d.accept());
    await row.getByTestId("uptime-delete").click();
    await expect(row).toHaveCount(0, { timeout: 20_000 });
  });
});
