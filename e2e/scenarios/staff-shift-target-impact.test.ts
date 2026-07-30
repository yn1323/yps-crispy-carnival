import { expect, test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import { waitForNotificationOutbox } from "../helpers/notificationProbe";
import { waitForFreshMagicLinkToken, waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

const TARGET_STAFF = {
  name: "対象切替スタッフ",
  email: "shift-target-e2e@example.com",
};

type OpenRecruitmentSeed = {
  shopId: string;
  recruitmentId: string;
};

test.describe("スタッフ詳細のシフト対象設定", { tag: ["@release", "@notification", "@security"] }, () => {
  test.setTimeout(60_000);

  test("下書き後の追加を反映し、対象外ではShiftFormと古いリンクから除外して復帰後に再送できる", async ({
    browser,
    page,
  }) => {
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates: getNextWeekDates(),
    });
    const dashboard = new DashboardPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("Step 1: 既存スタッフのシフトを下書き保存する", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.assignShift("田中太郎", { startTime: "10:00", endTime: "18:00" });
      await shiftBoard.saveDraft();
    });

    await test.step("Step 2: 下書き後にスタッフを追加し、既存draftと新しい行を確認する", async () => {
      await dashboard.goto();
      await dashboard.addStaffs([TARGET_STAFF]);
      await dashboard.openShiftBoard();
      await shiftBoard.expectStaffShiftTime("田中太郎", "10:00", "18:00");
      await shiftBoard.expectStaffVisible(TARGET_STAFF.name);
    });

    await test.step("Step 3: 追加時の法務、LINE案内、募集通知が各1件だけ受け付けられる", async () => {
      for (const notificationContext of [
        "legal.sendStaffConsentEmail",
        "line.sendInviteEmail",
        "notification.sendOpenRecruitmentNotificationEmailsForStaff",
      ]) {
        const probe = await waitForNotificationOutbox({
          shopId: seed.shopId,
          recruitmentId:
            notificationContext === "notification.sendOpenRecruitmentNotificationEmailsForStaff"
              ? seed.recruitmentId
              : undefined,
          staffEmail: TARGET_STAFF.email,
          notificationContext,
          channel: "email",
        });
        expect(probe.outbox).toHaveLength(1);
        expect(probe.failureInbox).toHaveLength(0);
      }
    });

    const initialToken = await waitForMagicLinkToken({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: TARGET_STAFF.email,
      purpose: "submit",
    });

    await test.step("Step 4: シフト対象外にするとShiftFormから消え、発行済みリンクも失効する", async () => {
      await dashboard.goto();
      await dashboard.setStaffShiftTarget(TARGET_STAFF.name, false);
      await dashboard.openShiftBoard();
      await shiftBoard.expectStaffNotVisible(TARGET_STAFF.name);

      const isolated = await browser.newContext({ baseURL: "http://localhost:3000" });
      const submitPage = new StaffSubmitPage(await isolated.newPage());
      try {
        await submitPage.goto(initialToken.token);
        await submitPage.expectUnavailableVisible();
      } finally {
        await isolated.close();
      }
    });

    await test.step("Step 5: シフト対象へ戻すとShiftFormへ復帰する", async () => {
      await dashboard.goto();
      await dashboard.setStaffShiftTarget(TARGET_STAFF.name, true);
      await dashboard.openShiftBoard();
      await shiftBoard.expectStaffVisible(TARGET_STAFF.name);
    });

    await test.step("Step 6: スタッフ詳細の店舗別設定から個別再送すると新しいリンクで提出できる", async () => {
      await dashboard.goto();
      await dashboard.sendOpenRecruitmentNotification(TARGET_STAFF.name);

      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: TARGET_STAFF.email,
        notificationContext: "notification.sendOpenRecruitmentNotificationsForStaff",
        channel: "email",
      });
      expect(probe.outbox).toHaveLength(1);

      const freshToken = await waitForFreshMagicLinkToken({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: TARGET_STAFF.email,
        purpose: "submit",
        previousToken: initialToken.token,
      });
      const isolated = await browser.newContext({ baseURL: "http://localhost:3000" });
      const submitPage = new StaffSubmitPage(await isolated.newPage());
      try {
        await submitPage.goto(freshToken.token);
        await submitPage.expectFormVisible();
      } finally {
        await isolated.close();
      }
    });
  });
});
