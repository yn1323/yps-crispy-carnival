import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test } from "@playwright/test";
import { convexRun } from "../helpers/convex";
import { getNextWeekDates } from "../helpers/date";
import { getOrCreateMagicLinkToken } from "../helpers/notificationTokens";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffViewPage } from "../pages/StaffViewPage";

const MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

test.describe("通知URL起点の確定シフト閲覧", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
    convexRun("testing:clearAllTables");
  });

  test("確定URLで閲覧し、使用済みURLから再発行した新URLでも閲覧できる", async ({ browser, page }) => {
    const dates = getNextWeekDates();
    const dashboard = new DashboardPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const staffView = new StaffViewPage(page);

    await test.step("Step 1: 店長が募集と確定シフトを準備する", async () => {
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
      convexRun("testing:seedShiftData", {
        staffAssignments: [
          {
            staffName: MANAGER.name,
            shifts: [{ dateIndex: 0, startTime: "10:00", endTime: "18:00" }],
          },
        ],
        dates: dates.dates,
      });
      await dashboard.openShiftBoard();
      await shiftBoard.confirm(1);
      await shiftBoard.expectConfirmedStatus();
    });

    const viewToken = await getOrCreateMagicLinkToken({ staffEmail: MANAGER.email, purpose: "view" });

    await test.step("Step 2: スタッフが確定シフトURLから閲覧できる", async () => {
      await staffView.goto(viewToken.token);
      await staffView.expectShiftViewVisible();
      await staffView.expectStaffVisible(MANAGER.name);
      await staffView.expectShiftTimeVisible();
    });

    await test.step("Step 3: 別ブラウザでは使用済みURLになり、再発行後のURLで閲覧できる", async () => {
      const isolated = await browser.newContext({ baseURL: "http://localhost:3000" });
      const isolatedPage = await isolated.newPage();
      const isolatedView = new StaffViewPage(isolatedPage);

      try {
        await isolatedView.goto(viewToken.token);
        await isolatedView.expectExpiredVisible();
        await isolatedView.requestReissue(MANAGER.email);

        const reissuedToken = await getOrCreateMagicLinkToken({ staffEmail: MANAGER.email, purpose: "view" });
        await isolatedView.goto(reissuedToken.token);
        await isolatedView.expectShiftViewVisible();
        await isolatedView.expectStaffVisible(MANAGER.name);
        await isolatedView.expectShiftTimeVisible();
      } finally {
        await isolated.close();
      }
    });
  });
});
