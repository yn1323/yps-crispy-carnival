import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_DEPLOYED_BASE_URL;

if (!baseURL) {
  throw new Error("E2E_DEPLOYED_BASE_URL is required for deployed smoke tests.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /scenarios\/deployed-smoke\.test\.ts/,
  timeout: 180_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-deployed" }],
    ["json", { outputFile: "test-results-deployed.json" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
