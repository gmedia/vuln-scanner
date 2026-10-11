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
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      // Keeps desktop specs from also running at phone width (md:block tables hide there).
      testIgnore: "**/*.mobile.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        headless: !process.env.DISPLAY,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      // Pixel 5 = hasTouch + isMobile + 393x851, i.e. the sub-md branches.
      testMatch: "**/*.mobile.spec.ts",
      use: {
        ...devices["Pixel 5"],
        headless: !process.env.DISPLAY,
      },
    },
  ],
  timeout: 90_000,
  expect: {
    timeout: 20_000,
  },
});
