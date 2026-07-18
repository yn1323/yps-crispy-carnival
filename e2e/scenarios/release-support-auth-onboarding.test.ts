import { expect, test } from "../fixtures/e2eTest";
import { resetCurrentManagerScenarioData } from "../helpers/scenarioSeeds";
import { AuthPage } from "../pages/AuthPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ManagerSupportPage } from "../pages/ManagerSupportPage";

test.describe("リリース前の認証・オンボーディング回帰", { tag: ["@release"] }, () => {
  test.setTimeout(45_000);

  test("ログアウト後に保護ページへ再アクセスするとログインへ戻される", { tag: ["@smoke", "@security"] }, async ({
    e2eClerkUser,
    e2eWorkerUser,
    page,
  }) => {
    const auth = new AuthPage(page);
    const dashboard = new DashboardPage(page);
    const support = new ManagerSupportPage(page);

    await test.step("Step 1: 認証済みでダッシュボードを開く", async () => {
      await dashboard.goto();
      await expect(page.getByRole("button", { name: "ユーザーメニュー" })).toBeVisible();
    });

    await test.step("Step 2: ユーザーメニューからログアウトする", async () => {
      await support.logout();
    });

    await test.step("Step 3: 保護ページを直接開いても認証を迂回できない", async () => {
      await support.revisitProtectedDashboardAfterLogout();
    });

    await test.step("Step 4: 後続E2E用の認証状態を復元する", async () => {
      await auth.loginWithEmailPassword(e2eClerkUser, process.env.E2E_CLERK_PASSWORD ?? "");
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.context().storageState({ path: e2eWorkerUser.storageStatePath });
    });
  });

  test("閉じたDashboardオンボーディングはreload後も再表示されない", async ({ page, e2eClerkUser }) => {
    resetCurrentManagerScenarioData();
    const dashboard = new DashboardPage(page);
    const support = new ManagerSupportPage(page);

    await test.step("Step 1: 初回セットアップ後にオンボーディングが表示される", async () => {
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "オンボーディング永続化店舗",
        managerName: "永続化テスト管理者",
        managerEmail: e2eClerkUser,
      });
      await dashboard.expectSetupComplete();
      await support.expectOnboardingVisible("1/4");
    });

    await test.step("Step 2: オンボーディングを閉じる", async () => {
      await support.dismissOnboarding();
    });

    await test.step("Step 3: reloadしても完了状態が維持される", async () => {
      await page.reload();
      await expect(page.getByRole("button", { name: "設定メニューを開く" })).toBeVisible();
      await support.expectOnboardingHidden();
    });
  });
});
