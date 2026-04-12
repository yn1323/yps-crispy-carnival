import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test } from "@playwright/test";
import { convexRun } from "../helpers/convex";
import { DashboardPage } from "../pages/DashboardPage";

test.describe("ダッシュボードのページネーション", () => {
  test.setTimeout(120_000);

  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
    dashboard = new DashboardPage(page);
  });

  test("もっと見る・すべて表示でデータが段階的に表示される", async () => {
    await test.step("Step 0: データ準備", async () => {
      convexRun("testing:clearAllTables");

      // UI経由でshop + user作成（Clerkのsubjectと自動的に紐付く）
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "ページネーションテスト店舗",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerName: "テスト管理者",
        ownerEmail: "admin@example.com",
      });
      await dashboard.expectSetupComplete();

      // DB直接投入: staffs 12人 + recruitments 8件
      convexRun("testing:seedPaginationTestData");
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
      // オーナー（completeSetupで作成）+ 12人 = 13人、初期表示10人
      await dashboard.expectStaffRowCount(10);
      await dashboard.expectShowAllStaffsVisible();

      await dashboard.clickShowAllStaffs();
      await dashboard.expectStaffRowCount(13);
      await dashboard.expectShowAllStaffsNotVisible();
    });
  });
});
