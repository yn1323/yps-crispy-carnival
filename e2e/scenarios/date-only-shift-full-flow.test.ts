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

type DateOnlyFlowSeed = {
  shopId: string;
};

test.describe("日付のみ方式のシフト確定", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(90_000);

  test("再提出から管理者編集、下書き、確定通知、スタッフ閲覧までつながる", async ({ browser, page }) => {
    const dates = getNextWeekDates();
    const dateLabels = dates.dates.map(formatDateWithWeekday);
    const seed = seedManagerScenario<DateOnlyFlowSeed>("testing:seedLegalManagerConsentScenario", {
      legalConsentState: "current",
    });
    const dashboard = new DashboardPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("店舗を日付のみ方式にして募集を作成する", async () => {
      await dashboard.goto();
      await dashboard.editShopSettings({ submissionPattern: { kind: "dateOnly" } });
      await dashboard.createRecruitment(dates);
    });

    const submitToken = await test.step("スタッフが希望日を提出し、内容を修正して再提出する", async () => {
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
        await submitPage.toggleDay(dateLabels[0]);
        await submitPage.toggleDay(dateLabels[1]);
        await submitPage.submit();
        await submitPage.expectCompletionVisible();

        await submitPage.goto(token.token);
        await submitPage.expectSubmittedBadge();
        await submitPage.expectDateWorking(dateLabels[0]);
        await submitPage.expectDateWorking(dateLabels[1]);
        await submitPage.toggleDay(dateLabels[0]);
        await submitPage.toggleDay(dateLabels[2]);
        await submitPage.expectDayOff(dateLabels[0]);
        await submitPage.expectDateWorking(dateLabels[2]);
        await submitPage.submit();
        await submitPage.expectCompletionVisible();
      } finally {
        await staffContext.close();
      }
      return token;
    });

    await test.step("管理者が希望日の割当を編集し、下書きがreload後も残る", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectDateOnlyAssignment(MANAGER.name, dateLabels[0], false);
      await shiftBoard.expectDateOnlyAssignment(MANAGER.name, dateLabels[1], true);
      await shiftBoard.expectDateOnlyAssignment(MANAGER.name, dateLabels[2], true);
      await shiftBoard.toggleDateOnlyAssignment(MANAGER.name, dateLabels[1], true);
      await shiftBoard.saveDraft();

      await shiftBoard.reload();
      await shiftBoard.expectDateOnlyAssignment(MANAGER.name, dateLabels[1], false);
      await shiftBoard.expectDateOnlyAssignment(MANAGER.name, dateLabels[2], true);
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

    await test.step("スタッフが管理者編集後の日付のみシフトを閲覧する", async () => {
      const context = await browser.newContext({ baseURL: "http://localhost:3000" });
      const staffView = new StaffViewPage(await context.newPage());
      try {
        await staffView.goto(viewToken.token);
        await staffView.expectShiftViewVisible();
        await staffView.expectDateOnlyAssignment(MANAGER.name, dateLabels[0], false);
        await staffView.expectDateOnlyAssignment(MANAGER.name, dateLabels[1], false);
        await staffView.expectDateOnlyAssignment(MANAGER.name, dateLabels[2], true);
      } finally {
        await context.close();
      }
    });
  });
});
