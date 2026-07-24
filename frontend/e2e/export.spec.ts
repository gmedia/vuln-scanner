import { test, expect } from "@playwright/test";

const API_KEY = process.env.API_KEY || "dev-api-key-change-me";
const BASE_URL = process.env.BASE_URL || "http://localhost:8000";

async function login(
  request: Parameters<Parameters<typeof test>[1]>[0]["request"],
) {
  const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
    headers: { "Content-Type": "application/json", "X-E2E-Test": "true" },
    data: { email: "e2e@vulnscan.dev", password: "E2eTestPass123!" },
  });
  expect(loginRes.status()).toBe(200);
  const body = await loginRes.json();
  return body.access_token as string;
}

test.describe("Export", () => {
  test("export buttons trigger download on completed scan", async ({
    page,
    request,
  }) => {
    const authToken = await login(request);
    const resp = await request.post(`${BASE_URL}/api/scan/ip`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        Authorization: `Bearer ${authToken}`,
        "X-E2E-Test": "true",
      },
      data: { target: "127.0.0.1", ports: "1-100" },
    });
    expect(resp.status()).toBe(202);
    const { id } = await resp.json();

    let scanStatus = "pending";
    for (let i = 0; i < 30; i++) {
      const getResp = await request.get(`${BASE_URL}/api/scan/${id}`, {
        headers: {
          "X-API-Key": API_KEY,
          Authorization: `Bearer ${authToken}`,
          "X-E2E-Test": "true",
        },
      });
      const job = await getResp.json();
      scanStatus = job.status;
      if (scanStatus === "completed" || scanStatus === "failed") break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    expect(scanStatus).toBe("completed");

    await page.goto(`/scan/${id}`);
    await expect(page.locator("h2:has-text('Scan details')")).toBeVisible({
      timeout: 15_000,
    });

    const jsonBtn = page.locator('button:has-text("JSON")');
    const htmlBtn = page.locator('button:has-text("HTML")');
    await expect(jsonBtn).toBeVisible();
    await expect(htmlBtn).toBeVisible();

    const [jsonResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/scan/${id}/export?format=json`) &&
          r.status() === 200,
      ),
      jsonBtn.click(),
    ]);
    expect(jsonResponse.status()).toBe(200);

    const [htmlResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/scan/${id}/export?format=html`) &&
          r.status() === 200,
      ),
      htmlBtn.click(),
    ]);
    expect(htmlResponse.status()).toBe(200);
  });
});
