import { test } from "../fixtures/e2eTest";
import { resetCurrentManagerScenarioData } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ManagerSupportPage } from "../pages/ManagerSupportPage";

test.describe("リリース前の要望受付回帰", { tag: ["@release"] }, () => {
  test.setTimeout(45_000);

  test("管理ユーザーがDashboardから要望を送信できる", async ({ page, e2eClerkUser }) => {
    await resetCurrentManagerScenarioData();
    const dashboard = new DashboardPage(page);
    const support = new ManagerSupportPage(page);

    await test.step("Step 1: 店舗をセットアップする", async () => {
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "要望受付E2E店舗",
        managerName: "要望受付テスト管理者",
        managerEmail: e2eClerkUser,
      });
      await dashboard.expectSetupComplete();
    });

    await test.step("Step 2: ヘッダーから要望を送信する", async () => {
      await support.submitFeatureRequest("スタッフ一覧を勤務区分で絞り込みたいです");
    });
  });
});
