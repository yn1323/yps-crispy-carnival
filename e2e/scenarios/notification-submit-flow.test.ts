import { test } from "@playwright/test";
import { convexRun } from "../helpers/convex";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { getOrCreateMagicLinkToken } from "../helpers/notificationTokens";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

const MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

test.describe("通知URL起点のシフト募集", () => {
  test.setTimeout(90_000);

  test.beforeEach(async () => {
    convexRun("testing:clearAllTables");
  });

  test("募集開始で発行されたURLから提出し、店長画面に再編集まで反映される", async ({ page }) => {
    const dates = getNextWeekDates();
    const dashboard = new DashboardPage(page);
    const submitPage = new StaffSubmitPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("Step 1: 店長が初期セットアップと募集開始を行う", async () => {
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "テスト居酒屋",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerName: MANAGER.name,
        ownerEmail: MANAGER.email,
      });
      await dashboard.expectSetupComplete();
      await dashboard.createRecruitment({
        periodStart: dates.periodStart,
        periodEnd: dates.periodEnd,
        deadline: dates.deadline,
      });
      await dashboard.expectRecruitmentCardVisible();
    });

    const firstToken = await getOrCreateMagicLinkToken({ staffEmail: MANAGER.email, purpose: "submit" });

    await test.step("Step 2: スタッフが通知URLからシフト希望を提出する", async () => {
      await submitPage.goto(firstToken.token);
      await submitPage.expectFormVisible();
      await submitPage.expectUnsubmittedBadge();
      await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });

    await test.step("Step 3: 店長画面に提出内容が反映される", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectOnShiftBoard();
      await shiftBoard.expectOverviewStaffTimeCount(MANAGER.name, 1);
    });

    await test.step("Step 4: スタッフが再編集し、店長画面にも更新後の内容が反映される", async () => {
      await submitPage.goto(firstToken.token);
      await submitPage.expectFormVisible();
      await submitPage.expectSubmittedBadge();
      await submitPage.toggleDay(formatDateWithWeekday(dates.dates[2]));
      await submitPage.submit();
      await submitPage.expectCompletionVisible();

      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectOverviewStaffTimeCount(MANAGER.name, 2);
    });
  });
});
