import { test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

const REMINDED_STAFF = {
  name: "佐藤花子",
  email: "sato@example.com",
};

type ReminderScenarioSeed = {
  submitToken: string;
};

test.describe("通知URL起点のシフト提出催促", () => {
  test.setTimeout(45_000);

  test("通常submitリンクから提出し、未提出表示が解消される", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ReminderScenarioSeed>("testing:seedNotificationReminderScenario", { dates });
    const dashboard = new DashboardPage(page);
    const submitPage = new StaffSubmitPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("Step 3: シフト担当者が未提出者の自動催促予定を確認する", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectAutomaticReminderInfo();
    });

    await test.step("Step 4: 通常submitリンクから未提出スタッフが提出し、シフト担当者画面の未提出表示が消える", async () => {
      await submitPage.goto(seed.submitToken);
      await submitPage.expectFormVisible();
      await submitPage.toggleDay(formatDateWithWeekday(dates.dates[1]));
      await submitPage.submit();
      await submitPage.expectCompletionVisible();

      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectNoUnsubmittedReminder();
      await shiftBoard.expectOverviewStaffHasTime(REMINDED_STAFF.name);
    });
  });
});
