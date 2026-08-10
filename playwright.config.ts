import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { getE2EWorkerCount } from "./e2e/helpers/e2eUsers";

dotenv.config({ debug: false, quiet: true });

// Playwright 1.61が失敗時に自動取得する画面全体のARIA snapshotを止める。
// matcher由来のsnapshotとerror本文は先頭のprivacy reporterでredactする。
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

/**
 * E2Eテスト実行順序と依存関係:
 *
 * 1. setup
 *    ├── E2E_CLERK_USERS の通常用3ユーザーでログイン認証を実行
 *    └── 認証状態をファイルに保存
 *
 * 2. 通常の認証済みテスト
 *    └── parallelIndexごとに固定したユーザーとowner graphで並列実行
 *    └── logout境界だけはuser 3〜5のfresh sessionを使い、通常用storage stateを失効させない
 *
 * 3. モバイル代表テスト
 *    └── Desktop完了後に通常用ユーザーを再利用し、同じownerの同時利用を避ける
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/fixtures/globalSetup.ts",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  /* A retry-pass is still a release risk and must fail the CI gate. */
  failOnFlakyTests: !!process.env.CI,
  /* 公開レポートへGit差分・author情報を収録しない。workflow側でhead SHAを管理する。 */
  captureGitInfo: { commit: false, diff: false },
  /* 通常用3ユーザーとparallelIndexを固定対応させる。 */
  workers: getE2EWorkerCount(),
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["./e2e/reporters/privacyReporter.ts"],
    ["list", { printSteps: true }],
    ["html"],
    ["json", { outputFile: "test-results.json" }],
  ],
  /* 並列実行時の初回購読・描画待ちを考慮しつつ、操作失敗を早く検知する。 */
  expect: {
    timeout: 10_000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",

    /* worker数にかかわらず、ローカルとCIで待機上限を揃える。 */
    actionTimeout: 10_000,
    navigationTimeout: 15_000,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* テスト失敗時にスクリーンショットと動画を保存 */
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /* E2EはChrome系だけを対象にし、DesktopとMobileの代表viewportを分ける。 */
  projects: [
    // Step 1: 認証セットアップ（全プロジェクトの前提条件）
    {
      name: "setup",
      testMatch: /fixtures\/.*\.setup\.ts/,
      // password入力を含む認証setupはtraceへ保存しない。
      use: {
        screenshot: "off",
        trace: "off",
        video: "off",
      },
    },

    // Step 2: 通常のメインユーザー（管理者）のテスト
    {
      name: "desktop-chromium",
      testMatch: /scenarios\/.*\.test\.ts/,
      testIgnore: [/\.mobile\.test\.ts$/, /accessibility\.test\.ts$/, /deployed-smoke\.test\.ts$/],
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["setup"],
    },
    {
      name: "mobile-chrome",
      testMatch: /scenarios\/.*\.mobile\.test\.ts/,
      use: {
        ...devices["Pixel 7"],
      },
      dependencies: ["desktop-chromium"],
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
