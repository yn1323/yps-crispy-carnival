import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { clerk } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { installSafeClerkTestingConsole } from "../helpers/diagnostics";
import { getE2ECoreClerkUsers } from "../helpers/e2eUsers";
import { forceResetManagerScenarioData } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";

const E2E_CLERK_USERS = getE2ECoreClerkUsers();

// user単位のforce resetを直列化し、同じowner graphを並行削除しない。
setup.describe.configure({ mode: "serial" });

for (const user of E2E_CLERK_USERS) {
  setup(`prepare Clerk testing token and sign in: user-${user.index + 1}`, async ({ page }) => {
    const restoreClerkConsole = installSafeClerkTestingConsole();
    let testError: unknown;
    let testFailed = false;
    let cleanupFailed = false;
    try {
      const password = process.env.E2E_CLERK_PASSWORD;
      if (!password) throw new Error("E2E preflight failed: E2E_CLERK_PASSWORD is required");
      // Clerk の認証画面そのものはE2E対象外。以降の manager 画面検証に必要な storageState だけ作る。
      // clerk.signIn は window.Clerk が必要。LP(/)は Clerk を読み込まないため、
      // ClerkProvider を持つ /login へ遷移してからサインインする。
      await page.goto("/login");
      try {
        await clerk.signIn({
          page,
          signInParams: {
            strategy: "password",
            identifier: user.email,
            password,
          },
        });
      } catch {
        throw new Error(`E2E Clerk sign-in failed: user-${user.index + 1}`);
      }

      // Dashboardの利用者向けready stateまで確認してから保存し、未完了のtoken fetchを次testへ持ち越さない。
      await new DashboardPage(page).goto();

      mkdirSync(dirname(user.storageStatePath), { recursive: true });
      await page.context().storageState({ path: user.storageStatePath });
      // 前回runが通知異常で停止していても再実行できるよう、setup時にこの管理者のデータだけ回収する。
      // 同一run内の各seedはstrict resetを使い、通知異常を削除前に必ず検出する。
      forceResetManagerScenarioData(user.index);
      writeFileSync(
        user.metaPath,
        `${JSON.stringify({ email: user.email, index: user.index, storageStatePath: user.storageStatePath }, null, 2)}\n`,
      );
    } catch (error) {
      testError = error;
      testFailed = true;
    }

    try {
      // Clerk testing routeを待って解除し、context終了後のretryと機密URL付きwarningを防ぐ。
      await page.context().unrouteAll({ behavior: "wait" });
    } catch {
      cleanupFailed = true;
    }
    restoreClerkConsole();

    if (testFailed) throw testError;
    if (cleanupFailed) throw new Error(`E2E Clerk route cleanup failed: user-${user.index + 1}`);
  });
}
