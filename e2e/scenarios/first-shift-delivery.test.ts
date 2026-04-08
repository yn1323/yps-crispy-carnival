import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { convexRun } from "../helpers/convex";
import { getNextWeekDates } from "../helpers/date";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";

const dates = getNextWeekDates();

const STAFF_ASSIGNMENTS = [
  {
    staffName: "田中太郎",
    shifts: [0, 1, 2, 3, 4].map((i) => ({ dateIndex: i, startTime: "10:00", endTime: "18:00" })),
  },
  {
    staffName: "鈴木花子（編集済）",
    shifts: [0, 2, 4].map((i) => ({ dateIndex: i, startTime: "11:00", endTime: "19:00" })),
  },
  {
    staffName: "佐藤次郎",
    shifts: [1, 3, 5].map((i) => ({ dateIndex: i, startTime: "14:00", endTime: "23:00" })),
  },
];

test.describe("田中さんの初めてのシフト確定", () => {
  test.setTimeout(120_000);
  let dashboard: DashboardPage;
  let shiftBoard: ShiftBoardPage;

  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
    dashboard = new DashboardPage(page);
    shiftBoard = new ShiftBoardPage(page);
  });

  test("初回セットアップからシフト確定まで", async ({ page }) => {
    convexRun("testing:clearAllTables");

    await test.step("Step 1: 初回セットアップを完了する", async () => {
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "テスト居酒屋",
        shiftStartTime: "10:00",
        shiftEndTime: "23:00",
        ownerName: "田中太郎",
        ownerEmail: "tanaka@example.com",
      });
      await dashboard.expectSetupComplete();
    });

    await test.step("Step 2: スタッフを追加する", async () => {
      await dashboard.addStaffs([
        { name: "鈴木花子", email: "suzuki@example.com" },
        { name: "佐藤次郎", email: "sato@example.com" },
      ]);
      await dashboard.expectStaffSectionVisible();
      await dashboard.expectStaffVisible("田中太郎");
      await dashboard.expectStaffVisible("鈴木花子");
      await dashboard.expectStaffVisible("佐藤次郎");
    });

    await test.step("Step 2.5: スタッフを編集する", async () => {
      await dashboard.editStaff("鈴木花子", {
        name: "鈴木花子（編集済）",
        email: "suzuki-edited@example.com",
      });
      await dashboard.expectStaffVisible("鈴木花子（編集済）");
    });

    await test.step("Step 2.6: スタッフを削除する", async () => {
      await dashboard.addStaffs([{ name: "削除テスト", email: "delete-test@example.com" }]);
      await dashboard.expectStaffVisible("削除テスト");
      await dashboard.deleteStaff("削除テスト");
      await dashboard.expectStaffNotVisible("削除テスト");
      await dashboard.expectStaffVisible("田中太郎");
      await dashboard.expectStaffVisible("鈴木花子（編集済）");
      await dashboard.expectStaffVisible("佐藤次郎");
    });

    await test.step("Step 3: シフト希望収集を作成する", async () => {
      await dashboard.createRecruitment({
        periodStart: dates.periodStart,
        periodEnd: dates.periodEnd,
        deadline: dates.deadline,
      });
      await dashboard.expectRecruitmentCardVisible();
    });

    convexRun("testing:seedShiftData", { staffAssignments: STAFF_ASSIGNMENTS, dates: dates.dates });

    await test.step("Step 4: シフトボードを開いて全体を確認する", async () => {
      await dashboard.openShiftBoard();
      await shiftBoard.expectOnShiftBoard();
      await shiftBoard.expectStaffVisible("田中太郎");
      await shiftBoard.expectStaffVisible("鈴木花子（編集済）");
      await shiftBoard.expectStaffVisible("佐藤次郎");
      await shiftBoard.expectShiftBarVisible();
    });

    await test.step("Step 5: 日別ビューでシフトを確認する", async () => {
      await shiftBoard.expectShiftBarVisible();
    });

    await test.step("Step 6: 別の日を確認する", async () => {
      await shiftBoard.switchDateTab(1);
      await shiftBoard.expectStaffVisible("佐藤次郎");
    });

    await test.step("Step 7: 一覧ビューで最終確認する", async () => {
      await shiftBoard.switchToOverview();
      // daily/overviewのテーブルが両方DOMにあるため、visible なテーブルを対象
      const table = page.locator("table").filter({ has: page.getByRole("button", { name: /田中太郎/ }) });
      await expect(table).toBeVisible();
      await expect(table.getByText(/\d{1,2}:\d{2}-\d{1,2}:\d{2}/).first()).toBeVisible();
    });

    await test.step("Step 8: シフトを確定して通知する", async () => {
      await shiftBoard.confirm(3);
      await shiftBoard.expectConfirmedStatus();
      await shiftBoard.expectResendButton();
    });
  });
});
