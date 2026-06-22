import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  use: {
    storageState: "e2e/.auth/storageState.json",
    baseURL: process.env.BASE_URL || "http://localhost",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: !process.env.DISPLAY,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
});
