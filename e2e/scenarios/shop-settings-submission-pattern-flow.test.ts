import { expect, test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { waitForNotificationOutbox } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";
import { StaffViewPage } from "../pages/StaffViewPage";

const MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

type ShopSettingsSeed = {
  shopId: string;
};

test.describe("勤務区分方式のシフト確定", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(90_000);

  test("再提出から管理者編集、下書き、確定通知、スタッフ閲覧までつながる", async ({ browser, page }) => {
    const dates = getNextWeekDates();
    const closedDateLabel = formatDateWithWeekday(dates.dates[0]);
    const firstWorkingDateLabel = formatDateWithWeekday(dates.dates[1]);
    const seed = seedManagerScenario<ShopSettingsSeed>("testing:seedLegalManagerConsentScenario", {
      legalConsentState: "current",
    });
    const dashboard = new DashboardPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("店舗設定で勤務区分と定休日を保存し、募集を作成する", async () => {
      await dashboard.goto();
      await dashboard.editShopSettings({
        submissionPattern: {
          kind: "shiftType",
          options: [
            { name: "早番", startTime: "09:00", endTime: "15:00" },
            { name: "遅番", startTime: "15:00", endTime: "21:00" },
          ],
        },
        regularClosedDays: ["mon"],
      });
      await dashboard.createRecruitment(dates, {
        expectedHolidaySummary: "1日",
        expectedHolidayDetail: closedDateLabel,
      });
    });

    const submitToken = await test.step("スタッフが勤務区分を提出し、内容を修正して再提出する", async () => {
      const recruitmentProbe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
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

      const token = await waitForMagicLinkToken({
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
        purpose: "submit",
      });

      const staffContext = await browser.newContext({ baseURL: "http://localhost:3000" });
      const submitPage = new StaffSubmitPage(await staffContext.newPage());
      try {
        await submitPage.goto(token.token);
        await submitPage.expectFormVisible();
        await submitPage.expectShopClosed(closedDateLabel);
        await submitPage.selectShiftTypeDay(firstWorkingDateLabel);
        await submitPage.submit();
        await submitPage.expectCompletionVisible();

        await submitPage.goto(token.token);
        await submitPage.expectSubmittedBadge();
        await submitPage.expectShiftTypeOptionSelected(firstWorkingDateLabel, "早番");
        await submitPage.expectShiftTypeOptionNotSelected(firstWorkingDateLabel, "遅番");
        await submitPage.toggleShiftTypeOption(firstWorkingDateLabel, "遅番");
        await submitPage.deselectShiftTypeOption(firstWorkingDateLabel, "早番");
        await submitPage.expectShiftTypeOptionNotSelected(firstWorkingDateLabel, "早番");
        await submitPage.expectShiftTypeOptionSelected(firstWorkingDateLabel, "遅番");
        await submitPage.submit();
        await submitPage.expectCompletionVisible();
      } finally {
        await staffContext.close();
      }
      return token;
    });

    await test.step("管理者が勤務区分を編集し、下書きがreload後も残る", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectOnShiftBoard();
      await shiftBoard.switchDateTab(1);
      await shiftBoard.expectShiftTypeAssignment(MANAGER.name, "早番", false);
      await shiftBoard.expectShiftTypeAssignment(MANAGER.name, "遅番", true);
      await shiftBoard.toggleShiftTypeAssignment(MANAGER.name, "早番", false);
      await shiftBoard.toggleShiftTypeAssignment(MANAGER.name, "遅番", true);
      await shiftBoard.saveDraft();

      await shiftBoard.reload();
      await shiftBoard.switchDateTab(1);
      await shiftBoard.expectShiftTypeAssignment(MANAGER.name, "早番", true);
      await shiftBoard.expectShiftTypeAssignment(MANAGER.name, "遅番", false);
    });

    const viewToken = await test.step("確定通知が受け付けられ、閲覧URLが発行される", async () => {
      await shiftBoard.confirm(1);
      await shiftBoard.expectConfirmedStatus();

      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: submitToken.recruitmentId,
        staffEmail: MANAGER.email,
        notificationContext: "notification.sendConfirmationEmail",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(probe.failureInbox).toHaveLength(0);

      return await waitForMagicLinkToken({
        shopId: seed.shopId,
        recruitmentId: submitToken.recruitmentId,
        staffEmail: MANAGER.email,
        purpose: "view",
      });
    });

    await test.step("スタッフが管理者編集後の勤務区分シフトを閲覧する", async () => {
      const context = await browser.newContext({ baseURL: "http://localhost:3000" });
      const staffView = new StaffViewPage(await context.newPage());
      try {
        await staffView.goto(viewToken.token);
        await staffView.expectShiftViewVisible();
        await staffView.switchDateTab(1);
        await staffView.expectShiftTypeAssignment(MANAGER.name, "早番", true);
        await staffView.expectShiftTypeAssignment(MANAGER.name, "遅番", false);
      } finally {
        await context.close();
      }
    });
  });
});
