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

const REMINDED_STAFF = {
  name: "佐藤花子",
  email: "sato@example.com",
};

test.describe("通知URL起点のシフト提出催促", () => {
  test.setTimeout(90_000);

  test.beforeEach(async () => {
    convexRun("testing:clearAllTables");
  });

  test("催促で発行された未提出者URLから提出し、未提出表示が解消される", async ({ page }) => {
    const dates = getNextWeekDates();
    const dashboard = new DashboardPage(page);
    const submitPage = new StaffSubmitPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("Step 1: 店長がスタッフ2名で募集を開始する", async () => {
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "テスト居酒屋",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerName: MANAGER.name,
        ownerEmail: MANAGER.email,
      });
      await dashboard.expectSetupComplete();
      await dashboard.addStaffs([REMINDED_STAFF]);
      await dashboard.createRecruitment({
        periodStart: dates.periodStart,
        periodEnd: dates.periodEnd,
        deadline: dates.deadline,
      });
    });

    await test.step("Step 2: 片方のスタッフだけ先に提出する", async () => {
      const submittedToken = await getOrCreateMagicLinkToken({ staffEmail: MANAGER.email, purpose: "submit" });
      await submitPage.goto(submittedToken.token);
      await submitPage.expectFormVisible();
      await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });

    await test.step("Step 3: 店長が未提出者に催促を送る", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.sendReminders(1);
    });

    await test.step("Step 4: 催促URLから未提出スタッフが提出し、店長画面の未提出表示が消える", async () => {
      const reminderToken = await getOrCreateMagicLinkToken({ staffEmail: REMINDED_STAFF.email, purpose: "submit" });
      await submitPage.goto(reminderToken.token);
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
