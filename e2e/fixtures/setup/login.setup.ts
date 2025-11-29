import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { E2EAuthJsonFileMainUser, E2EAuthJsonFileSubUser } from "@/e2e/constants";

// Setup must be run serially, this is necessary if Playwright is configured to run fully parallel: https://playwright.dev/docs/test-parallel
setup.describe.configure({ mode: "serial" });

setup("グローバルセットアップ", async () => {
  await clerkSetup();
  if (!process.env.E2E_CLERK_USER || !process.env.E2E_CLERK_PASSWORD) {
    throw new Error("Please provide E2E_CLERK_USER and E2E_CLERK_PASSWORD environment variables.");
  }

  if (!process.env.E2E_CLERK_USER_B || !process.env.E2E_CLERK_PASSWORD_B) {
    throw new Error("Please provide E2E_CLERK_USER_B and E2E_CLERK_PASSWORD_B environment variables.");
  }
});

setup("ログイン（メインユーザー）", async ({ page }) => {
  await page.goto("/");

  // メインユーザー（管理者）でログイン
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER ?? "",
      password: process.env.E2E_CLERK_PASSWORD ?? "",
    },
  });

  // 認証状態を保存
  await page.context().storageState({ path: E2EAuthJsonFileMainUser });
});

setup("ログイン（サブユーザー）", async ({ page }) => {
  await page.goto("/");

  // サブユーザー（新規店長）でログイン
  // このユーザーはConvexのusersテーブルに存在しない状態でテストする
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER_B ?? "",
      password: process.env.E2E_CLERK_PASSWORD_B ?? "",
    },
  });

  // 認証状態を保存
  await page.context().storageState({ path: E2EAuthJsonFileSubUser });
  await clerk.signOut({ page });
});
