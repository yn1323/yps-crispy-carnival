import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_DEPLOYED_BASE_URL;

if (!baseURL) {
  throw new Error("E2E_DEPLOYED_BASE_URL is required for deployed smoke tests.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /scenarios\/deployed-smoke\.test\.ts/,
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-deployed" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
