import { expect, test } from "../fixtures/e2eTest";
import { convexRunJson } from "../helpers/convex";
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

const REMINDED_STAFF = {
  name: "佐藤花子",
  email: "sato@example.com",
};
const MANAGER_EMAIL = "tanaka@example.com";

type ReminderScenarioSeed = {
  shopId: string;
  recruitmentId: string;
};

test.describe("通知URL起点のシフト提出催促", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(60_000);

  test("通常submitリンクから提出し、未提出表示が解消される", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ReminderScenarioSeed>("testing:seedNotificationReminderScenario", { dates });
    const dashboard = new DashboardPage(page);
    const submitPage = new StaffSubmitPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("Step 1: シフト担当者が未提出者の自動催促予定を確認する", async () => {
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.expectAutomaticReminderInfo();
    });

    const submitToken = await test.step("Step 2: 自動催促actionからoutbox受付と提出URL発行を確認する", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      const result = convexRunJson<{ scheduled: boolean }>("testing:triggerNotificationReminderScenario", {
        recruitmentId: seed.recruitmentId,
      });
      expect(result.scheduled).toBe(true);

      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: REMINDED_STAFF.email,
        notificationContext: "notification.sendReminderEmails",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "notification.sendReminderEmails",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      return await waitForMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: REMINDED_STAFF.email,
        purpose: "submit",
      });
    });

    await test.step("Step 3: 催促通知のURLから提出し、シフト担当者画面の未提出表示が消える", async () => {
      await submitPage.goto(submitToken.token);
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

  test("LINE連携済みの未提出スタッフへ自動催促と提出CTAを受け付ける", async () => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ReminderScenarioSeed>("testing:seedNotificationReminderScenario", {
      dates,
      remindedStaffLineState: "following",
    });

    assertNotificationDeliverySuppressed(seed.shopId);
    const result = convexRunJson<{ scheduled: boolean }>("testing:triggerNotificationReminderScenario", {
      recruitmentId: seed.recruitmentId,
    });
    expect(result.scheduled).toBe(true);

    const probe = await waitForNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: REMINDED_STAFF.email,
      notificationContext: "notification.sendReminderEmails",
      channel: "line",
    });
    expect(probe.outbox[0]).toMatchObject({
      channel: "line",
      notificationContext: "notification.sendReminderEmails",
      deliverySuppressed: true,
      hasRecruitmentTarget: true,
      hasStaffTarget: true,
    });
    expect(probe.failureInbox).toHaveLength(0);
    await assertNoNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: REMINDED_STAFF.email,
      notificationContext: "notification.sendReminderEmails",
      channel: "email",
    });
    const token = await waitForMagicLinkToken({
      recruitmentId: seed.recruitmentId,
      shopId: seed.shopId,
      staffEmail: REMINDED_STAFF.email,
      purpose: "submit",
    });
    expect(token.token).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("LINE連携済み管理者本人が未提出なら自動催促の対象になる", async () => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ReminderScenarioSeed>("testing:seedNotificationReminderScenario", {
      dates,
      managerLineState: "following",
      managerIsReminderTarget: true,
    });

    assertNotificationDeliverySuppressed(seed.shopId);
    const result = convexRunJson<{ scheduled: boolean }>("testing:triggerNotificationReminderScenario", {
      recruitmentId: seed.recruitmentId,
    });
    expect(result.scheduled).toBe(true);

    const probe = await waitForNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: MANAGER_EMAIL,
      notificationContext: "notification.sendReminderEmails",
      channel: "line",
    });
    expect(probe.outbox[0]).toMatchObject({
      channel: "line",
      deliverySuppressed: true,
      hasRecruitmentTarget: true,
      hasStaffTarget: true,
    });
    await assertNoNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: MANAGER_EMAIL,
      notificationContext: "notification.sendReminderEmails",
      channel: "email",
    });
  });
});
