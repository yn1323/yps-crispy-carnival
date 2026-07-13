import { expect, test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { waitForNotificationOutbox } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { getCurrentManagerShopId, resetCurrentManagerScenarioData } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";
import { StaffViewPage } from "../pages/StaffViewPage";

const dates = getNextWeekDates();
const dateLabels = dates.dates.map(formatDateWithWeekday);
const MANAGER_EMAIL = "tanaka-changed@example.com";

test.describe("田中さんの初めてのシフト確定", { tag: ["@release", "@smoke", "@notification"] }, () => {
  test.setTimeout(90_000);
  let dashboard: DashboardPage;
  let shiftBoard: ShiftBoardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    shiftBoard = new ShiftBoardPage(page);
  });

  test("初回セットアップから下書き保存、確定、スタッフ閲覧まで", async ({ browser }) => {
    resetCurrentManagerScenarioData();

    await test.step("Step 1: 初回セットアップを完了する", async () => {
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "テスト居酒屋",
        shiftStartTime: "10:00",
        shiftEndTime: "23:00",
        managerName: "田中太郎",
        managerEmail: "tanaka@example.com",
      });
      await dashboard.expectSetupComplete();
    });

    await test.step("Step 1.5: 店舗名を変更する", async () => {
      await dashboard.editShopSettings({ shopName: "テスト居酒屋（変更済）" });
      await dashboard.expectShopName("テスト居酒屋（変更済）");
      await dashboard.expectShopTimeRange("10:00〜23:00");
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

    await test.step("Step 2.55: 自分のスタッフ情報を編集するとアバターに反映される", async () => {
      await dashboard.editStaff("田中太郎", {
        name: "田中太郎",
        email: MANAGER_EMAIL,
      });
      await dashboard.expectUserMenuInfo("田中太郎", MANAGER_EMAIL);
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

    await test.step("Step 3.5: 募集作成後にシフト時間帯を変更する（既存募集はスナップショットを保持）", async () => {
      await dashboard.editShopSettings({ shiftStartTime: "09:00", shiftEndTime: "22:00" });
      await dashboard.expectShopTimeRange("09:00〜22:00");
      await dashboard.expectRecruitmentCardVisible();
    });

    await test.step("Step 4: スタッフが時間指定で提出し、修正して再提出する", async () => {
      const shopId = getCurrentManagerShopId();
      const recruitmentProbe = await waitForNotificationOutbox({
        shopId,
        staffEmail: MANAGER_EMAIL,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        channel: "email",
      });
      expect(recruitmentProbe.outbox[0]).toMatchObject({
        channel: "email",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(recruitmentProbe.failureInbox).toHaveLength(0);

      const submitToken = await waitForMagicLinkToken({
        shopId,
        staffEmail: MANAGER_EMAIL,
        purpose: "submit",
      });
      const staffContext = await browser.newContext({ baseURL: "http://localhost:3000" });
      const submitPage = new StaffSubmitPage(await staffContext.newPage());
      try {
        await submitPage.goto(submitToken.token);
        await submitPage.expectFormVisible();
        await submitPage.toggleDay(dateLabels[0]);
        await submitPage.toggleDay(dateLabels[1]);
        await submitPage.submit();
        await submitPage.expectCompletionVisible();

        await submitPage.goto(submitToken.token);
        await submitPage.expectSubmittedBadge();
        await submitPage.expectDayWorking(dateLabels[0]);
        await submitPage.expectDayWorking(dateLabels[1]);
        await submitPage.clearDay(dateLabels[1]);
        await submitPage.toggleDay(dateLabels[2]);
        await submitPage.expectDayOff(dateLabels[1]);
        await submitPage.expectDayWorking(dateLabels[2]);
        await submitPage.submit();
        await submitPage.expectCompletionVisible();
      } finally {
        await staffContext.close();
      }
    });

    await test.step("Step 5: シフトボードを開いて全体を確認する", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectOnShiftBoard();
      await shiftBoard.expectStaffVisible("田中太郎");
      await shiftBoard.expectStaffVisible("鈴木花子（編集済）");
      await shiftBoard.expectStaffVisible("佐藤次郎");
    });

    await test.step("Step 6: 再提出内容を確認し、勤務時間を編集する", async () => {
      await shiftBoard.switchDateTab(1);
      await shiftBoard.expectStaffRequestedDayOff("田中太郎");

      await shiftBoard.switchDateTab(2);
      await shiftBoard.expectStaffRequestedTime("田中太郎", "10:00", "23:00");
      await shiftBoard.expectStaffShiftTime("田中太郎", "10:00", "23:00");
      await shiftBoard.replaceShift(
        "田中太郎",
        { startTime: "10:00", endTime: "23:00" },
        { startTime: "11:00", endTime: "18:00" },
      );
    });

    await test.step("Step 7: 下書きを保存し、reload後も割り当てが残る", async () => {
      await shiftBoard.saveDraft();
      await shiftBoard.reload();
      await shiftBoard.switchDateTab(2);
      await shiftBoard.expectStaffShiftTime("田中太郎", "11:00", "18:00");
    });

    await test.step("Step 8: 一覧ビューで最終確認する", async () => {
      await shiftBoard.expectOverviewStaffTimeCount("田中太郎", 2);
    });

    await test.step("Step 9: シフトを確定して通知する", async () => {
      await shiftBoard.confirm(3);
      await shiftBoard.expectConfirmedStatus();
      await shiftBoard.expectResendButton();

      const confirmationProbe = await waitForNotificationOutbox({
        shopId: getCurrentManagerShopId(),
        staffEmail: MANAGER_EMAIL,
        notificationContext: "notification.sendConfirmationEmail",
        channel: "email",
      });
      expect(confirmationProbe.outbox[0]).toMatchObject({
        channel: "email",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(confirmationProbe.failureInbox).toHaveLength(0);
    });

    await test.step("Step 10: スタッフが確定通知のURLからシフトを閲覧する", async () => {
      const shopId = getCurrentManagerShopId();
      const token = await waitForMagicLinkToken({
        shopId,
        staffEmail: MANAGER_EMAIL,
        purpose: "view",
      });
      const staffContext = await browser.newContext({ baseURL: "http://localhost:3000" });
      const staffPage = await staffContext.newPage();
      const staffView = new StaffViewPage(staffPage);

      try {
        await staffView.goto(token.token);
        await staffView.expectShiftViewVisible();
        await staffView.expectStaffVisible("田中太郎");
        await staffView.switchDateTab(0);
        await staffView.expectStaffShiftTime("田中太郎", "10:00", "23:00");
        await staffView.switchDateTab(1);
        await staffView.expectStaffHasNoShiftTime("田中太郎");
        await staffView.switchDateTab(2);
        await staffView.expectStaffShiftTime("田中太郎", "11:00", "18:00");
      } finally {
        await staffContext.close();
      }
    });
  });
});
