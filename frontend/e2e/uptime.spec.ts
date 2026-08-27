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
    const create = page.waitForResponse(
      (r) => r.url().includes("/api/uptime") && r.request().method() === "POST",
    );
    await page.getByTestId("uptime-save").click();
    const res = await create;
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = await res.text();
    expect(body.toLowerCase()).toMatch(/not allowed|private/);
  });

  test("creates HTTP monitor against lab/public target then deletes", async ({
    page,
  }) => {
    const stamp = Date.now();
    const name = `e2e-up-${stamp}`;
    const base = httpTarget().replace(/\/$/, "");
    const target = `${base}${base.includes("?") ? "&" : "?"}e2e=${stamp}`;
    await page.goto("/uptime");
    page.on("dialog", (d) => d.accept());
    const leftovers = page
      .locator("main")
      .getByRole("listitem")
      .filter({ hasText: /e2e-up-/ });
    while ((await leftovers.count()) > 0) {
      const n = await leftovers.count();
      await leftovers
        .first()
        .getByRole("button", { name: /hapus|delete/i })
        .click();
      await expect.poll(async () => leftovers.count()).toBeLessThan(n);
    }
    await page.getByTestId("uptime-add").click();
    await page.getByTestId("uptime-name").fill(name);
    await page.getByTestId("uptime-target").fill(target);
    const create = page.waitForResponse(
      (r) => r.url().includes("/api/uptime") && r.request().method() === "POST",
    );
    await page.getByTestId("uptime-save").click();
    expect((await create).status()).toBeLessThan(400);

    const row = page
      .locator("main")
      .getByRole("listitem")
      .filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(/http/i);
    await expect(row).toContainText(/unknown|up|down|degraded/i);

    await row.getByRole("button", { name: /hapus|delete/i }).click();
    await expect(row).toHaveCount(0, { timeout: 20_000 });
  });

  test("creates TCP monitor when E2E_UPTIME_TCP is set", async ({ page }) => {
    const tcp = tcpTarget();
    test.skip(!tcp, "Set E2E_UPTIME_TCP=host:port for lab TCP probe");
    const name = `e2e-tcp-${Date.now()}`;
    await page.goto("/uptime");
    await page.getByTestId("uptime-add").click();
    await page.getByTestId("uptime-type").click();
    await page.getByRole("option", { name: "tcp" }).click();
    await page.getByTestId("uptime-name").fill(name);
    await page.getByTestId("uptime-target").fill(tcp!);
    await page.getByTestId("uptime-save").click();
    const row = page.locator('[data-testid="uptime-row"]').filter({
      hasText: name,
    });
    await expect(row).toBeVisible({ timeout: 20_000 });
    page.once("dialog", (d) => d.accept());
    const del = row
      .getByTestId("uptime-delete")
      .or(row.getByRole("button", { name: /hapus|delete/i }));
    await del.click();
    await expect(row).toHaveCount(0, { timeout: 20_000 });
  });
});
