import { expect, test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNoNotificationOutbox, waitForNotificationOutbox } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedMultiShopOrganizationScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";
import { StaffViewPage } from "../pages/StaffViewPage";

test.describe("勤務区分方式のシフト確定", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(120_000);

  test("REG-P0-01: B店の再提出から確定閲覧までつながり、A店へ混入しない", async ({ browser, page }) => {
    const dates = getNextWeekDates();
    const closedDateLabel = formatDateWithWeekday(dates.dates[0]);
    const firstWorkingDateLabel = formatDateWithWeekday(dates.dates[1]);
    const seed = seedMultiShopOrganizationScenario({
      primaryShopName: "勤務区分E2E A店",
      secondaryShopName: "勤務区分E2E B店",
      primaryMarkerPersonName: "A店シフトスタッフ",
      primaryMarkerPersonEmail: "reg-p0-01-primary@shiftori.invalid",
      secondaryMarkerPersonName: "B店シフトスタッフ",
      secondaryMarkerPersonEmail: "reg-p0-01-secondary@shiftori.invalid",
    });
    const dashboard = new DashboardPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("B店の店舗設定で勤務区分と定休日を保存し、募集を作成する", async () => {
      await dashboard.goto(seed.secondaryShopId);
      await dashboard.expectSelectedShop(seed.secondaryShopName, seed.secondaryShopId);
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
        shopId: seed.secondaryShopId,
        staffEmail: seed.secondaryMarkerPersonEmail,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        channel: "email",
      });
      expect(recruitmentProbe.outbox[0]).toMatchObject({
        channel: "email",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
        ctaTokenMatchesTarget: true,
      });
      expect(recruitmentProbe.failureInbox).toHaveLength(0);

      const token = await waitForMagicLinkToken({
        shopId: seed.secondaryShopId,
        staffEmail: seed.secondaryMarkerPersonEmail,
        purpose: "submit",
      });
      if (!token.recruitmentId) throw new Error("B店の募集IDを取得できませんでした");

      const staffContext = await browser.newContext({ baseURL: "http://localhost:3000" });
      const submitPage = new StaffSubmitPage(await staffContext.newPage());
      try {
        await submitPage.goto(token.token);
        await submitPage.expectFormVisible();
        await submitPage.expectLegalConsentVisible();
        await submitPage.expectShopClosed(closedDateLabel);
        await submitPage.selectShiftTypeDay(firstWorkingDateLabel);
        await submitPage.acceptLegalConsent();
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
      return { token: token.token, recruitmentId: token.recruitmentId };
    });

    await test.step("B店の管理者が勤務区分を編集し、下書きがreload後も残る", async () => {
      await dashboard.goto(seed.secondaryShopId);
      await dashboard.openShiftBoard();
      await shiftBoard.expectOnShiftBoard();
      await shiftBoard.expectShopContext(seed.secondaryShopId);
      await shiftBoard.switchDateTab(1);
      await shiftBoard.expectShiftTypeAssignment(seed.secondaryMarkerPersonName, "早番", false);
      await shiftBoard.expectShiftTypeAssignment(seed.secondaryMarkerPersonName, "遅番", true);
      await shiftBoard.expectStaffNotVisible(seed.primaryMarkerPersonName);
      await shiftBoard.toggleShiftTypeAssignment(seed.secondaryMarkerPersonName, "早番", false);
      await shiftBoard.toggleShiftTypeAssignment(seed.secondaryMarkerPersonName, "遅番", true);
      await shiftBoard.saveDraft();

      await shiftBoard.reload();
      await shiftBoard.expectShopContext(seed.secondaryShopId);
      await shiftBoard.switchDateTab(1);
      await shiftBoard.expectShiftTypeAssignment(seed.secondaryMarkerPersonName, "早番", true);
      await shiftBoard.expectShiftTypeAssignment(seed.secondaryMarkerPersonName, "遅番", false);
    });

    const viewToken = await test.step("確定通知が受け付けられ、閲覧URLが発行される", async () => {
      await shiftBoard.confirm(1);
      await shiftBoard.expectConfirmedStatus();

      const probe = await waitForNotificationOutbox({
        shopId: seed.secondaryShopId,
        recruitmentId: submitToken.recruitmentId,
        staffEmail: seed.secondaryMarkerPersonEmail,
        notificationContext: "notification.sendConfirmationEmail",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
        ctaTokenMatchesTarget: true,
      });
      expect(probe.failureInbox).toHaveLength(0);

      return await waitForMagicLinkToken({
        shopId: seed.secondaryShopId,
        recruitmentId: submitToken.recruitmentId,
        staffEmail: seed.secondaryMarkerPersonEmail,
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
        await staffView.expectShiftTypeAssignment(seed.secondaryMarkerPersonName, "早番", true);
        await staffView.expectShiftTypeAssignment(seed.secondaryMarkerPersonName, "遅番", false);
      } finally {
        await context.close();
      }
    });

    await test.step("A店にはB店のスタッフ、募集、通知が混入せず、A店のShiftBoardも分離される", async () => {
      await dashboard.goto(seed.primaryShopId);
      await dashboard.expectSelectedShop(seed.primaryShopName, seed.primaryShopId);
      await dashboard.expectStaffVisible(seed.primaryMarkerPersonName);
      await dashboard.expectStaffNotVisible(seed.secondaryMarkerPersonName);
      await dashboard.expectRecruitmentCardCount(0);
      await assertNoNotificationOutbox({
        shopId: seed.primaryShopId,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
      });
      await assertNoNotificationOutbox({
        shopId: seed.primaryShopId,
        notificationContext: "notification.sendConfirmationEmail",
      });

      await dashboard.createRecruitment(dates);
      await dashboard.openShiftBoard();
      await shiftBoard.expectShopContext(seed.primaryShopId);
      await shiftBoard.expectStaffVisible(seed.primaryMarkerPersonName);
      await shiftBoard.expectStaffNotVisible(seed.secondaryMarkerPersonName);
    });
  });
});
