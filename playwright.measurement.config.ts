import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_MEASUREMENT_BASE_URL ?? "http://127.0.0.1:4174";
const startProductionServer = process.env.E2E_MEASUREMENT_START_SERVER === "true";

// capability queryを含む失敗情報へtokenを残さない。
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /scenarios\/measurement-enabled\.test\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  failOnFlakyTests: !!process.env.CI,
  workers: 1,
  projects: [{ name: "measurement-enabled-chromium" }],
  reporter: [
    ["./e2e/reporters/privacyReporter.ts"],
    ["list"],
    ["json", { outputFile: "test-results-measurement.json" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: startProductionServer
    ? {
        // CIのsynthetic measurement buildだけを起動する。通常のlocal作業では既存serverを利用する。
        command: "pnpm exec vite preview --host 127.0.0.1 --port 4174 --strictPort",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 30_000,
      }
    : undefined,
});
