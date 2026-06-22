import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "fs";

async function globalSetup(config: FullConfig) {
  const baseURL = process.env.BASE_URL || "http://localhost";

  const browser = await chromium.launch();
  const page = await browser.newPage();

  const loginRes = await page.request.post(`${baseURL}/api/auth/login`, {
    data: {
      email: "e2e@vulnscan.dev",
      password: "E2eTestPass123!",
    },
  });

  if (loginRes.status() !== 200) {
    console.error(`Login failed: ${loginRes.status()} ${await loginRes.text()}`);
    await browser.close();
    process.exit(1);
  }

  await page.goto(`${baseURL}/dashboard`);
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
