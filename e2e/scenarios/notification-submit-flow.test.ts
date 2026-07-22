import { expect, test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import {
  assertNoNotificationOutbox,
  assertNotificationDeliverySuppressed,
  waitForNotificationOutbox,
} from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

const MANAGER = {
  name: "田中太郎",
};

type SubmitScenarioSeed = {
  shopId: string;
};

test.describe("通知URL起点のシフト募集", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(45_000);

  test("募集開始で発行されたURLから提出し、シフト担当者画面に再編集まで反映される", async ({ page, e2eClerkUser }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<SubmitScenarioSeed>("testing:seedNotificationSubmitScenario", { dates });
    const dashboard = new DashboardPage(page);
    const submitPage = new StaffSubmitPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    const token = await test.step("Step 1: 管理者が募集を作成し、通知受付と提出URL発行を確認する", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      await dashboard.goto();
      await dashboard.createRecruitment(dates);

      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        staffEmail: e2eClerkUser,
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "notification.sendRecruitmentNotificationEmails",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      return await waitForMagicLinkToken({
        shopId: seed.shopId,
        staffEmail: e2eClerkUser,
        purpose: "submit",
      });
    });

    await test.step("Step 2: スタッフが通知で発行されたURLからシフト希望を提出する", async () => {
      await submitPage.goto(token.token);
      await submitPage.expectFormVisible();
      await submitPage.expectUnsubmittedBadge();
      await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });

    await test.step("Step 3: シフト担当者画面に提出内容が反映される", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectOnShiftBoard();
      await shiftBoard.expectOverviewStaffTimeCount(MANAGER.name, 1);
    });

    await test.step("Step 4: スタッフが再編集し、シフト担当者画面にも更新後の内容が反映される", async () => {
      await submitPage.goto(token.token);
      await submitPage.expectFormVisible();
      await submitPage.expectSubmittedBadge();
      await submitPage.toggleDay(formatDateWithWeekday(dates.dates[2]));
      await submitPage.submit();
      await submitPage.expectCompletionVisible();

      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectOverviewStaffTimeCount(MANAGER.name, 2);
    });
  });

  test("LINE連携済みスタッフへ募集開始通知と提出CTAを受け付ける", async ({ page, e2eClerkUser }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<SubmitScenarioSeed>("testing:seedNotificationSubmitScenario", {
      dates,
      managerLineState: "following",
    });
    const dashboard = new DashboardPage(page);

    assertNotificationDeliverySuppressed(seed.shopId);
    await dashboard.goto();
    await dashboard.createRecruitment(dates);

    const probe = await waitForNotificationOutbox({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      notificationContext: "notification.sendRecruitmentNotificationEmails",
      channel: "line",
    });
    expect(probe.outbox[0]).toMatchObject({
      channel: "line",
      notificationContext: "notification.sendRecruitmentNotificationEmails",
      deliverySuppressed: true,
      hasRecruitmentTarget: true,
      hasStaffTarget: true,
    });
    expect(probe.failureInbox).toHaveLength(0);
    await assertNoNotificationOutbox({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      notificationContext: "notification.sendRecruitmentNotificationEmails",
      channel: "email",
    });

    const token = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });
    expect(token.token).toMatch(/^[0-9a-f-]{36}$/);
  });
});
