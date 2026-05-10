import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { getE2EWorkerCount } from "./e2e/helpers/e2eUsers";

dotenv.config({ debug: false, quiet: true });

/**
 * E2Eテスト実行順序と依存関係:
 *
 * 1. setup
 *    ├── E2E_CLERK_USERS の3ユーザーでログイン認証を実行
 *    └── 認証状態をファイルに保存
 *
 * 2. 認証済みテスト
 *    └── workerごとに別ユーザーの storageState を使い、owner単位のseedで並列実行
 *
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./e2e",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  /* E2E_CLERK_USERS のユーザー数に合わせて、別ユーザーで並列実行する。 */
  workers: getE2EWorkerCount(),
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["list"], ["html"], ["json", { outputFile: "test-results.json" }]],
  /* expect() の待機上限。エラー発生時に即座に失敗を返すため短めに設定 */
  expect: {
    timeout: process.env.CI ? 10_000 : 5_000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",

    /* アクション/遷移単位の待機上限。失敗を早く検知するためCIでも10秒に抑える */
    actionTimeout: process.env.CI ? 10_000 : 5_000,
    navigationTimeout: process.env.CI ? 15_000 : 8_000,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* テスト失敗時にスクリーンショットと動画を保存 */
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /* Configure projects for major browsers */
  projects: [
    // Step 1: 認証セットアップ（全プロジェクトの前提条件）
    {
      name: "setup",
      testMatch: /fixtures\/.*\.setup\.ts/,
    },

    // Step 2: メインユーザー（管理者）のテスト
    {
      name: "シナリオテスト",
      testMatch: /scenarios\/(?!userB\/).*\.test\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
      VITE_CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY,
      CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY,
    } as Record<string, string>,
  },
});
