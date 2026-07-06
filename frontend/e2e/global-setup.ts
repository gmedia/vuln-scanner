import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "fs";

async function globalSetup(config: FullConfig) {
  const baseURL = process.env.BASE_URL || "http://localhost";

  const browser = await chromium.launch({
    ignoreHTTPSErrors: true,
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const loginRes = await page.request.post(`${baseURL}/api/auth/login`, {
    data: {
      email: "e2e@vulnscan.dev",
      password: "E2eTestPass123!",
    },
  });

  if (loginRes.status() !== 200) {
    console.error(
      `Login failed: ${loginRes.status()} ${await loginRes.text()}`,
    );
    await browser.close();
    process.exit(1);
  }

  // Extract access_token AND refresh_token. Seed localStorage with both so:
  //  - initialize() finds accessToken and skips refreshAuth() initially
  //  - When the access token expires (30 min TTL), refreshAuth() can use the
  //    stored refresh token instead of relying on httpOnly cookies (which are
  //    not captured by Playwright's storageState).
  const loginData = await loginRes.json();
  const accessToken = loginData.access_token;
  const refreshToken = loginData.refresh_token;
  if (!accessToken) {
    console.error("Login response missing access_token");
    await browser.close();
    process.exit(1);
  }

  // Set tokens in localStorage via addInitScript so they're available when the
  // frontend app mounts and calls initialize().
  await page.context().addInitScript(
    ({
      accessToken,
      refreshToken,
    }: {
      accessToken: string;
      refreshToken?: string;
    }) => {
      window.localStorage.setItem("accessToken", accessToken);
      if (refreshToken) {
        window.localStorage.setItem("refreshToken", refreshToken);
      }
    },
    { accessToken, refreshToken },
  );

  await page.goto(`${baseURL}/dashboard`);
  // Wait for Dashboard to fully render (ensures initialize() → refreshAuth() completes
  // and accessToken is saved to localStorage before we capture storageState)
  await page.waitForSelector("h2:has-text('DASHBOARD')", { timeout: 15_000 });
  if (page.url().includes("/login")) {
    console.error("Auth verification failed: redirected to login");
    await browser.close();
    process.exit(1);
  }

  // Replenish credits for E2E test user — scans consume credits and after many
  // runs the balance can drop below what tests need (domain: 2, IP: 1 credit).
  try {
    // Fetch user ID via /api/auth/me
    const meRes = await page.request.get(`${baseURL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-API-Key": process.env.API_KEY || "dev-api-key-change-me",
        "X-E2E-Test": "true",
      },
    });
    if (meRes.status() === 200) {
      const me = await meRes.json();
      await page.request.post(`${baseURL}/api/admin/users/${me.id}/credits`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "X-API-Key": process.env.API_KEY || "dev-api-key-change-me",
          "X-E2E-Test": "true",
        },
        data: { amount: 1000 },
      });
    }
  } catch {
    // Non-fatal — tests may still work if credits haven't run out
  }

  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: "e2e/.auth/storageState.json" });

  await browser.close();
}

export default globalSetup;
