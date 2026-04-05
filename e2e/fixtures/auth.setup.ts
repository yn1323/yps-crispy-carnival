import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

const STORAGE_STATE_PATH = "e2e/.clerk/user.json";

setup("prepare Clerk testing token and sign in", async ({ page }) => {
  await clerkSetup();

  // サインイン
  await page.goto("/");
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER ?? "",
      password: process.env.E2E_CLERK_PASSWORD ?? "",
    },
  });

  // サインイン後にダッシュボードへ遷移
  await page.goto("/dashboard");
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  // 認証状態をstorageStateとして保存
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
