import { expect, test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import { getNotificationProbe, waitForNotificationOutbox } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffViewPage } from "../pages/StaffViewPage";

const MANAGER = { name: "田中太郎" };
const ADDED_STAFF = { name: "確定後追加スタッフ", email: "confirmed-added@example.com" };

type ConfirmedShiftSeed = {
  shopId: string;
  recruitmentId: string;
};

test.describe("確定後に追加したスタッフ", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(75_000);

  test("既存シフトを保持して新しい行を追加し、割当後は変更対象だけへ閲覧通知する", async ({
    browser,
    page,
    e2eClerkUser,
  }) => {
    const seed = seedManagerScenario<ConfirmedShiftSeed>("testing:seedNotificationConfirmationViewScenario", {
      dates: getNextWeekDates(),
    });
    const dashboard = new DashboardPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("Step 1: 既存スタッフのシフトを確定して初回通知する", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.confirm(1);
      const initialProbe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: e2eClerkUser,
        notificationContext: "notification.sendConfirmationEmail",
        channel: "email",
      });
      expect(initialProbe.outbox).toHaveLength(1);
      expect(initialProbe.outbox[0].isResend).toBe(false);
    });

    await test.step("Step 2: 確定済みシフトへスタッフを追加する", async () => {
      await dashboard.goto();
      await dashboard.addStaffs([ADDED_STAFF]);

      for (const notificationContext of ["legal.sendStaffConsentEmail", "line.sendInviteEmail"]) {
        const probe = await waitForNotificationOutbox({
          shopId: seed.shopId,
          staffEmail: ADDED_STAFF.email,
          notificationContext,
          channel: "email",
        });
        expect(probe.outbox).toHaveLength(1);
        expect(probe.failureInbox).toHaveLength(0);
      }

      expect(
        getNotificationProbe({
          shopId: seed.shopId,
          staffEmail: ADDED_STAFF.email,
          notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaff",
          channel: "email",
        }).outbox,
      ).toHaveLength(0);
    });

    await test.step("Step 3: ShiftFormは既存割当を保持し、追加スタッフの行も表示する", async () => {
      await dashboard.openShiftBoard();
      await shiftBoard.expectConfirmedStatus();
      await shiftBoard.expectStaffShiftTime(MANAGER.name, "10:00", "18:00");
      await shiftBoard.expectStaffVisible(ADDED_STAFF.name);
    });

    await test.step("Step 4: 追加スタッフだけを編集して変更通知する", async () => {
      await shiftBoard.assignShift(ADDED_STAFF.name, { startTime: "11:00", endTime: "17:00" });
      await shiftBoard.notifyChangedStaff();

      const addedProbe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: ADDED_STAFF.email,
        notificationContext: "notification.sendConfirmationEmail",
        channel: "email",
      });
      expect(addedProbe.outbox).toHaveLength(1);
      expect(addedProbe.outbox[0]).toMatchObject({ isResend: true, ctaTokenMatchesTarget: true });
      expect(addedProbe.failureInbox).toHaveLength(0);

      const managerProbe = getNotificationProbe({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: e2eClerkUser,
        notificationContext: "notification.sendConfirmationEmail",
        channel: "email",
      });
      expect(managerProbe.outbox.filter((job) => job.isResend)).toHaveLength(0);
    });

    await test.step("Step 5: 追加スタッフが通知URLから確定シフトを閲覧する", async () => {
      const token = await waitForMagicLinkToken({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: ADDED_STAFF.email,
        purpose: "view",
      });
      const context = await browser.newContext({ baseURL: "http://localhost:3000" });
      const staffView = new StaffViewPage(await context.newPage());
      try {
        await staffView.goto(token.token);
        await staffView.expectShiftViewVisible();
        await staffView.expectStaffVisible(ADDED_STAFF.name);
        await staffView.expectShiftTimeVisible();
      } finally {
        await context.close();
      }
    });
  });
});
