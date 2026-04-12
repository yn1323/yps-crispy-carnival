import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ debug: false, quiet: true });

/**
 * E2Eテスト実行順序と依存関係:
 *
 * 1. setup
 *    ├── 全ユーザーのログイン認証を実行
 *    └── 認証状態をファイルに保存
 *
 * 2. 認証済みテスト (User A / 管理者)
 *    ├── auth/login.test.ts - 認証確認
 *    ├── shop/register.test.ts - 店舗登録
 *    ├── shop/list.test.ts - 店舗一覧
 *    ├── shop/detail.test.ts - 店舗詳細
 *    ├── shop/edit.test.ts - 店舗編集
 *    └── staff/list.test.ts - スタッフ一覧（StaffTab操作）
 *
 * 3. 認証済みテストB (User B / 新規店長)
 *    └── userB/new-owner.test.ts - 新規店長の初回ログイン〜店舗登録
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
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [["list"], ["html"], ["json", { outputFile: "test-results.json" }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",

    /* ローカルはサーバー起動済みで速いため短く（CIはPlaywrightデフォルト30sを使用） */
    ...(process.env.CI ? {} : { timeout: 5_000 }),

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
        storageState: "e2e/.clerk/user.json",
      },
      dependencies: ["setup"],
    },

    // Step 3: サブユーザー（新規店長）のテスト
    // DB未登録状態での初回ログインをテスト
    // {
    //   name: "認証済みテストB",
    //   testMatch: /scenarios\/userB\/.*\.test\.ts/,
    //   use: {
    //     ...devices["Desktop Chrome"],
    //     storageState: "e2e/.clerk/user-b.json",
    //   },
    //   dependencies: ["setup"],
    // },
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
