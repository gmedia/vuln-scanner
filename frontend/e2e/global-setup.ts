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

  mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: "e2e/.auth/storageState.json" });

  await browser.close();
}

export default globalSetup;
