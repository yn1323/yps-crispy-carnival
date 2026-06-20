import { test } from "../fixtures/e2eTest";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";

test.describe("ダッシュボードの一覧表示", () => {
  test.setTimeout(30_000);

  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
  });

  test("シフト一覧とスタッフ一覧が期待件数で表示される", async () => {
    await test.step("Step 0: データ準備", async () => {
      seedManagerScenario("testing:seedDashboardPaginationScenario");
    });

    await test.step("Step 1: シフト一覧は作成済みの募集を表示する", async () => {
      await dashboard.goto();

      await dashboard.expectRecruitmentCardCount(8);
    });

    await test.step("Step 2: スタッフの「もっと見る」で全員表示される", async () => {
      // 管理者 + 12人 = 13人、初期表示10人
      await dashboard.expectStaffRowCount(10);
      await dashboard.expectShowAllStaffsVisible();

      await dashboard.clickShowAllStaffs();
      await dashboard.expectStaffRowCount(13);
      await dashboard.expectShowAllStaffsNotVisible();
    });
  });
});
