import { test } from "../fixtures/e2eTest";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";

test.describe("ダッシュボードのページネーション", () => {
  test.setTimeout(30_000);

  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
  });

  test("もっと見る・すべて表示でデータが段階的に表示される", async () => {
    await test.step("Step 0: データ準備", async () => {
      seedManagerScenario("testing:seedDashboardPaginationScenario");
    });

    await test.step("Step 1: シフトの「もっと見る」で3件ずつ追加表示される", async () => {
      await dashboard.goto();

      await dashboard.expectRecruitmentCardCount(3);
      await dashboard.expectLoadMoreRecruitmentVisible();

      await dashboard.clickLoadMoreRecruitments();
      await dashboard.expectRecruitmentCardCount(6);
      await dashboard.expectLoadMoreRecruitmentVisible();

      await dashboard.clickLoadMoreRecruitments();
      await dashboard.expectRecruitmentCardCount(8);
      await dashboard.expectLoadMoreRecruitmentNotVisible();
    });

    await test.step("Step 2: スタッフの「すべて表示」で全員表示される", async () => {
      // 管理者 + 12人 = 13人、初期表示10人
      await dashboard.expectStaffRowCount(10);
      await dashboard.expectShowAllStaffsVisible();

      await dashboard.clickShowAllStaffs();
      await dashboard.expectStaffRowCount(13);
      await dashboard.expectShowAllStaffsNotVisible();
    });
  });
});
