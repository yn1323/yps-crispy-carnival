import { test } from "@playwright/test";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { seedOwnerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

const REMINDED_STAFF = {
  name: "佐藤花子",
  email: "sato@example.com",
};

type ReminderScenarioSeed = {
  reminderToken: string;
};

test.describe("通知URL起点のシフト提出催促", () => {
  test.setTimeout(90_000);

  test("催促で発行された未提出者URLから提出し、未提出表示が解消される", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedOwnerScenario<ReminderScenarioSeed>("testing:seedNotificationReminderScenario", { dates });
    const dashboard = new DashboardPage(page);
    const submitPage = new StaffSubmitPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("Step 3: 店長が未提出者に催促を送る", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.sendReminders(1);
    });

    await test.step("Step 4: 催促URLから未提出スタッフが提出し、店長画面の未提出表示が消える", async () => {
      await submitPage.goto(seed.reminderToken);
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
