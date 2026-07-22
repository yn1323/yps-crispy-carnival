import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import { getE2EMultiActorWorkerCount, getE2EWorkerCount } from "./e2e/helpers/e2eUsers";

dotenv.config({ debug: false, quiet: true });

/**
 * E2Eテスト実行順序と依存関係:
 *
 * 1. setup
 *    ├── E2E_CLERK_USERS の6ユーザーでログイン認証を実行
 *    └── 認証状態をファイルに保存
 *
 * 2. 複数actorテスト
 *    └── 3ユーザーずつの2 poolを使い、ファイル間を2 workerで並列実行
 *
 * 3. 通常の認証済みテスト
 *    └── 各workerが割り当てられたユーザーの storageState をテストごとに切り替え、owner単位のseedで並列実行
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
  /* A retry-pass is still a release risk and must fail the CI gate. */
  failOnFlakyTests: !!process.env.CI,
  /* 未指定時は6 worker。CIではE2E_WORKERSで6ユーザーを重複なく分割できるworker数へ抑える。 */
  workers: getE2EWorkerCount(),
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["list"], ["html"], ["json", { outputFile: "test-results.json" }]],
  /* 並列実行時の初回購読・描画待ちを考慮しつつ、操作失敗を早く検知する。 */
  expect: {
    timeout: 10_000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",

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
        trace: "off",
      },
    },

    // Step 2: 複数管理者を同時に扱うテスト
    {
      name: "multi-actor-chromium",
      testMatch: /scenarios\/multiActor\/.*\.test\.ts/,
      fullyParallel: false,
      workers: getE2EMultiActorWorkerCount(),
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["setup"],
    },

    // Step 3: 通常のメインユーザー（管理者）のテスト
    {
      name: "desktop-chromium",
      testMatch: /scenarios\/(?!userB\/).*\.test\.ts/,
      testIgnore: [/scenarios\/multiActor\/.*\.test\.ts$/, /\.mobile\.test\.ts$/, /deployed-smoke\.test\.ts$/],
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["multi-actor-chromium"],
    },
    {
      name: "mobile-chrome",
      testMatch: /scenarios\/.*\.mobile\.test\.ts/,
      testIgnore: [/scenarios\/multiActor\/.*\.test\.ts$/],
      use: {
        ...devices["Pixel 7"],
      },
      dependencies: ["multi-actor-chromium"],
    },
  ],

  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
