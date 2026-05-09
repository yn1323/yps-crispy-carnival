import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

const STORAGE_STATE_PATH = "e2e/.clerk/user.json";

setup("prepare Clerk testing token and sign in", async ({ page }) => {
  await clerkSetup();

  // Clerk の認証画面そのものはE2E対象外。ここでは以降の manager 画面検証に必要な storageState だけ作る。
  await page.goto("/");
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: process.env.E2E_CLERK_USER ?? "",
      password: process.env.E2E_CLERK_PASSWORD ?? "",
    },
  });

  // dashboard 到達まで確認してから保存し、後続 scenario が初回ロード競合を踏まないようにする。
  await page.goto("/dashboard");
  await page.waitForURL(/dashboard/, { timeout: 15000 });

  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
