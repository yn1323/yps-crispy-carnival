import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import {
  E2EAuthJsonFileGeneral,
  E2EAuthJsonFileMainUser,
  E2EAuthJsonFileManager,
  E2EAuthJsonFileSubUser,
} from "@/e2e/constants";

dotenv.config();

/**
 * E2Eテスト実行順序と依存関係:
 *
 * 1. setup
 *    ├── 全ユーザーのログイン認証を実行
 *    └── 認証状態をファイルに保存
 *
 * 2. 認証済みテスト (User A / Owner)
 *    ├── auth.test.ts - 認証確認
 *    ├── shop/register.test.ts - 店舗登録
 *    ├── shop/invite.test.ts - 招待URL生成 → ファイル保存
 *    ├── staff/access-control.test.ts - スタッフ閲覧
 *    └── staff/resign.test.ts - 退職処理
 *
 * 3. 認証済みテストB (User B) [依存: 認証済みテスト]
 *    └── userB/accept.test.ts - 招待受諾 ← invite.test.tsの結果を使用
 *
 * 4. 認証済みテスト（Manager） [依存: setup]
 *    └── manager/staff-access.test.ts - Manager権限でのスタッフ閲覧
 *
 * 5. 認証済みテスト（General） [依存: setup]
 *    └── general/staff-access.test.ts - General権限でのスタッフ閲覧
 *
 * 6. 認証済みテスト（General・退職後） [依存: 認証済みテスト]
 *    └── general/after-resign.test.ts - 退職後のアクセス制限確認
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
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",

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
      testMatch: /fixtures\/setup\/.*\.setup\.ts/,
    },

    // Step 2: メインユーザー（Owner）のテスト
    // 招待URL生成・退職処理など、他テストの前提となる処理を含む
    {
      name: "認証済みテスト",
      testMatch: /scenarios\/(?!userB\/|manager\/|general\/).*\.test\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: E2EAuthJsonFileMainUser,
      },
      dependencies: ["setup"],
    },

    // Step 3: サブユーザー（User B）のテスト
    // 「認証済みテスト」で生成された招待URLを使用するため、依存関係を設定
    {
      name: "認証済みテストB",
      testMatch: /scenarios\/userB\/.*\.test\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: E2EAuthJsonFileSubUser,
      },
      dependencies: ["認証済みテスト"],
    },

    // Step 4: Manager権限テスト（setupのみに依存、並列実行可能）
    ...(process.env.E2E_CLERK_USER_MANAGER
      ? [
          {
            name: "認証済みテスト（Manager）",
            testMatch: /scenarios\/manager\/.*\.test\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: E2EAuthJsonFileManager,
            },
            dependencies: ["setup"],
          },
        ]
      : []),

    // Step 5: General権限テスト（setupのみに依存）
    ...(process.env.E2E_CLERK_USER_GENERAL
      ? [
          {
            name: "認証済みテスト（General）",
            testMatch: /scenarios\/general\/staff-access\.test\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: E2EAuthJsonFileGeneral,
            },
            dependencies: ["setup"],
          },

          // Step 6: General退職後テスト
          // 「認証済みテスト」のresign.test.tsで退職処理が実行された後に実行
          {
            name: "認証済みテスト（General・退職後）",
            testMatch: /scenarios\/general\/after-resign\.test\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              storageState: E2EAuthJsonFileGeneral,
            },
            dependencies: ["認証済みテスト"],
          },
        ]
      : []),
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
