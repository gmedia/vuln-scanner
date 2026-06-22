import { test, expect } from "@playwright/test";

const API_KEY = process.env.API_KEY || "dev-api-key-change-me";
const BASE_URL = "http://localhost:8000";

test.describe("Scan Lifecycle", () => {
  test.describe("Domain scan — full lifecycle via API + UI", () => {
    test("triggers a domain scan and shows its detail page", async ({ page, request }) => {
      const resp = await request.post(`${BASE_URL}/api/scan/domain`, {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        data: { domain: "example.com" },
      });
      expect(resp.status()).toBe(202);

      const body = await resp.json();
      expect(body).toHaveProperty("id");
      expect(body.status).toBe("pending");
      const scanId = body.id;

      // Wait for the scan to appear in history
      await page.goto("/dashboard");
      await expect(page.locator(`a[href='/scan/${scanId}']`)).toBeVisible({
        timeout: 15_000,
      });

      // Navigate into scan detail
      await page.locator(`a[href='/scan/${scanId}']`).click();
      await expect(page).toHaveURL(`/scan/${scanId}`);
      await expect(page.locator("h2:has-text('SCAN DETAILS')")).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test.describe("IP scan — full lifecycle via API + UI", () => {
    test("triggers an IP scan on localhost, validates UI reflects it", async ({ page, request }) => {
      const resp = await request.post(`${BASE_URL}/api/scan/ip`, {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        data: { target: "127.0.0.1", ports: "1-100" },
      });
      expect(resp.status()).toBe(202);

      const body = await resp.json();
      expect(body).toHaveProperty("id");
      const scanId = body.id;

      // Navigate directly to scan detail — should load
      await page.goto(`/scan/${scanId}`);
      await expect(page.locator("h2:has-text('SCAN DETAILS')")).toBeVisible({
        timeout: 15_000,
      });

      // Scan should be reflected in dashboard history
      await page.goto("/dashboard");
      await expect(page.locator(`a[href='/scan/${scanId}']`)).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test.describe("API direct — scan CRUD", () => {
    test("triggers IP scan, fetches status via API", async ({ request }) => {
      // Create
      const createResp = await request.post(`${BASE_URL}/api/scan/ip`, {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY,
        },
        data: { target: "127.0.0.1", ports: "1-50" },
      });
      expect(createResp.status()).toBe(202);
      const { id } = await createResp.json();

      // Fetch status
      const getResp = await request.get(`${BASE_URL}/api/scan/${id}`, {
        headers: { "X-API-Key": API_KEY },
      });
      expect(getResp.status()).toBe(200);
      const job = await getResp.json();
      expect(job.id).toBe(id);
      expect(["pending", "running", "completed", "failed"]).toContain(job.status);

      // History includes it
      const historyResp = await request.get(`${BASE_URL}/api/scan/history`, {
        headers: { "X-API-Key": API_KEY },
      });
      expect(historyResp.status()).toBe(200);
      const history = await historyResp.json();
      const ids = history.items.map((s: any) => s.id);
      expect(ids).toContain(id);
    });
  });
});
