import dayjs from "dayjs";
import { test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import { resetCurrentManagerScenarioData } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";

const dates = getNextWeekDates();
const confirmedDates = {
  periodStart: dayjs(dates.periodStart).add(14, "day").format("YYYY-MM-DD"),
  periodEnd: dayjs(dates.periodEnd).add(14, "day").format("YYYY-MM-DD"),
  deadline: dayjs(dates.deadline).add(14, "day").format("YYYY-MM-DD"),
};

test.describe("シフト募集削除", () => {
  test.setTimeout(60_000);

  let dashboard: DashboardPage;
  let shiftBoard: ShiftBoardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    shiftBoard = new ShiftBoardPage(page);
  });

  test("未確定・確定済みの募集をダッシュボードから削除できる", async () => {
    resetCurrentManagerScenarioData();

    await test.step("Step 1: 店舗とスタッフを準備する", async () => {
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "募集削除テスト店舗",
        shiftStartTime: "10:00",
        shiftEndTime: "22:00",
        managerName: "募集削除管理者",
        managerEmail: "recruitment-delete-manager@example.com",
      });
      await dashboard.expectSetupComplete();
      await dashboard.addStaffs([{ name: "削除確認スタッフ", email: "recruitment-delete-staff@example.com" }]);
      await dashboard.expectStaffVisible("削除確認スタッフ");
    });

    await test.step("Step 2: 未確定の募集を作成して削除する", async () => {
      await dashboard.createRecruitment(dates);
      await dashboard.expectRecruitmentCardCount(1);

      await dashboard.deleteRecruitment();
      await dashboard.expectRecruitmentCardCount(0);
    });

    await test.step("Step 3: 確定済みの募集を作成する", async () => {
      await dashboard.createRecruitment(confirmedDates);
      await dashboard.expectRecruitmentCardCount(1);
      await dashboard.openShiftBoard();
      await shiftBoard.expectOnShiftBoard();
      await shiftBoard.confirm(2);
      await shiftBoard.expectConfirmedStatus();
    });

    await test.step("Step 4: 確定済みの募集も削除できる", async () => {
      await dashboard.goto();
      await dashboard.expectRecruitmentCardCount(1);

      await dashboard.deleteRecruitment();
      await dashboard.expectRecruitmentCardCount(0);
    });
  });
});
