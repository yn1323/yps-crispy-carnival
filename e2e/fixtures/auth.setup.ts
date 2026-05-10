import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { getE2EClerkUsers } from "../helpers/e2eUsers";

const E2E_CLERK_USERS = getE2EClerkUsers();

setup.describe.configure({ mode: "parallel" });

for (const user of E2E_CLERK_USERS) {
  setup(`prepare Clerk testing token and sign in: user-${user.index + 1}`, async ({ page }) => {
    await clerkSetup();

    // Clerk の認証画面そのものはE2E対象外。以降の manager 画面検証に必要な storageState だけ作る。
    await page.goto("/");
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: user.email,
        password: process.env.E2E_CLERK_PASSWORD ?? "",
      },
    });

    // dashboard 到達まで確認してから保存し、後続 scenario が初回ロード競合を踏まないようにする。
    await page.goto("/dashboard");
    await page.waitForURL(/dashboard/, { timeout: 15000 });

    mkdirSync(dirname(user.storageStatePath), { recursive: true });
    await page.context().storageState({ path: user.storageStatePath });
    writeFileSync(
      user.metaPath,
      `${JSON.stringify({ email: user.email, index: user.index, storageStatePath: user.storageStatePath }, null, 2)}\n`,
    );
  });
}
