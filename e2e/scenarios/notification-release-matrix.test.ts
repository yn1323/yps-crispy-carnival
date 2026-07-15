import dayjs from "dayjs";
import { expect, test } from "../fixtures/e2eTest";
import { convexRunJson } from "../helpers/convex";
import { getNextWeekDates } from "../helpers/date";
import {
  assertNoNotificationOutbox,
  assertNotificationDeliverySuppressed,
  assertNotificationRecipientSuppressed,
  waitForNotificationOutbox,
} from "../helpers/notificationProbe";
import { waitForLineLinkToken, waitForMagicLinkToken } from "../helpers/notificationTokens";
import {
  getCurrentManagerShopId,
  resetCurrentManagerScenarioData,
  seedManagerScenario,
} from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";

const MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

const CHANGED_MANAGER_EMAIL = "changed-manager@example.com";
const MANAGER_DIGEST_CONTEXTS = [
  "staffRegistration.sendOwnerDailyDigest",
  "shiftConfirmationReminder.sendManagerConfirmationReminder",
  "shopActivationReminder.sendReminder",
  "notificationOutbox.sendFailureReminderDigest",
] as const;

type ShopSeed = {
  shopId: string;
  recruitmentId: string;
};

function getCurrentShiftDates() {
  const periodStart = dayjs().subtract(1, "day");
  return {
    periodStart: periodStart.format("YYYY-MM-DD"),
    periodEnd: periodStart.add(6, "day").format("YYYY-MM-DD"),
    deadline: periodStart.subtract(1, "day").format("YYYY-MM-DD"),
    dates: Array.from({ length: 7 }, (_, index) => periodStart.add(index, "day").format("YYYY-MM-DD")),
  };
}

test.describe("通知目的別Full Regression", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(90_000);

  test("初期設定時に管理者へLINE連携案内を受け付ける", async ({ page, e2eClerkUser }) => {
    assertNotificationRecipientSuppressed(e2eClerkUser);
    resetCurrentManagerScenarioData();
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: 管理者が初期設定を完了する", async () => {
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "初期設定通知テスト店舗",
        managerName: "初期設定管理者",
        managerEmail: e2eClerkUser,
      });
      await dashboard.expectSetupComplete();
    });

    await test.step("Step 2: LINE連携案内のoutbox受付とtoken発行を確認する", async () => {
      const shopId = getCurrentManagerShopId();
      assertNotificationDeliverySuppressed(shopId);
      const probe = await waitForNotificationOutbox({
        shopId,
        staffEmail: e2eClerkUser,
        notificationContext: "line.sendInviteEmail",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "line.sendInviteEmail",
        deliverySuppressed: true,
        hasStaffTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      const token = await waitForLineLinkToken({ shopId, staffEmail: e2eClerkUser });
      expect(token.token).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  test("募集中の連絡先メール変更時に新しい宛先向け募集通知を受け付ける", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ShopSeed>("testing:seedOpenRecruitmentNotificationScenario", { dates });
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: 募集中に管理者スタッフの連絡先メールを変更する", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      await dashboard.goto();
      await dashboard.editStaff(MANAGER.name, { name: MANAGER.name, email: CHANGED_MANAGER_EMAIL });
    });

    await test.step("Step 2: 新メール向け募集通知の受付と提出token発行を確認する", async () => {
      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: CHANGED_MANAGER_EMAIL,
        notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      const token = await waitForMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: CHANGED_MANAGER_EMAIL,
        purpose: "submit",
      });
      expect(token.token).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  test("スタッフ詳細からLINE連携案内を手動再送できる", async ({ page }) => {
    const seed = seedManagerScenario<{ shopId: string }>("testing:seedLineLinkScenario");
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: スタッフ詳細のLINEタブから連携案内を送る", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      await dashboard.goto();
      await dashboard.sendLineInvite(MANAGER.name);
    });

    await test.step("Step 2: LINE連携案内の受付とtoken発行を確認する", async () => {
      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
        notificationContext: "line.sendInviteEmail",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "line.sendInviteEmail",
        deliverySuppressed: true,
        hasStaffTarget: true,
      });
      expect(probe.failureInbox).toHaveLength(0);
      const token = await waitForLineLinkToken({ shopId: seed.shopId, staffEmail: MANAGER.email });
      expect(token.token).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  test("LINE連携済みスタッフへ募集中シフトを手動再送できる", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ShopSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      managerLineState: "following",
    });
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: スタッフ詳細から募集中シフトを送る", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      await dashboard.goto();
      await dashboard.sendOpenRecruitmentNotification(MANAGER.name);
    });

    await test.step("Step 2: LINE outboxと提出CTAを確認する", async () => {
      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: MANAGER.email,
        notificationContext: "notification.sendOpenRecruitmentNotificationsForStaff",
        channel: "line",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "line",
        notificationContext: "notification.sendOpenRecruitmentNotificationsForStaff",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(probe.failureInbox).toHaveLength(0);
      await assertNoNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: MANAGER.email,
        notificationContext: "notification.sendOpenRecruitmentNotificationsForStaff",
        channel: "email",
      });
    });
  });

  test("LINE unfollow中は募集中シフトをメールへ振り分ける", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ShopSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      managerLineState: "unfollowed",
    });
    const dashboard = new DashboardPage(page);

    assertNotificationDeliverySuppressed(seed.shopId);
    await dashboard.goto();
    await dashboard.sendOpenRecruitmentNotification(MANAGER.name);

    const probe = await waitForNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: MANAGER.email,
      notificationContext: "notification.sendOpenRecruitmentNotificationsForStaff",
      channel: "email",
    });
    expect(probe.outbox[0]).toMatchObject({
      channel: "email",
      deliverySuppressed: true,
      hasRecruitmentTarget: true,
      hasStaffTarget: true,
    });
    expect(probe.failureInbox).toHaveLength(0);
    await assertNoNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: MANAGER.email,
      notificationContext: "notification.sendOpenRecruitmentNotificationsForStaff",
      channel: "line",
    });
  });

  test("スタッフ詳細から現在の確定シフトを手動通知できる", async ({ page }) => {
    const seed = seedManagerScenario<ShopSeed>("testing:seedCurrentShiftManualNotificationScenario", {
      dates: getCurrentShiftDates(),
    });
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: スタッフ詳細から現在の確定シフトを送る", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      await dashboard.goto();
      await dashboard.sendCurrentShiftNotification(MANAGER.name);
    });

    await test.step("Step 2: 確定通知の受付と閲覧token発行を確認する", async () => {
      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: MANAGER.email,
        notificationContext: "notification.sendConfirmationEmail",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "notification.sendConfirmationEmail",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      const token = await waitForMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
        purpose: "view",
      });
      expect(token.token).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  test("LINE連携済みスタッフへ現在の確定シフトを手動通知できる", async ({ page }) => {
    const seed = seedManagerScenario<ShopSeed>("testing:seedCurrentShiftManualNotificationScenario", {
      dates: getCurrentShiftDates(),
      managerLineState: "following",
    });
    const dashboard = new DashboardPage(page);

    assertNotificationDeliverySuppressed(seed.shopId);
    await dashboard.goto();
    await dashboard.sendCurrentShiftNotification(MANAGER.name);

    const probe = await waitForNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: MANAGER.email,
      notificationContext: "notification.sendConfirmationEmail",
      channel: "line",
    });
    expect(probe.outbox[0]).toMatchObject({
      channel: "line",
      notificationContext: "notification.sendConfirmationEmail",
      deliverySuppressed: true,
      hasRecruitmentTarget: true,
      hasStaffTarget: true,
    });
    expect(probe.failureInbox).toHaveLength(0);
    await assertNoNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: MANAGER.email,
      notificationContext: "notification.sendConfirmationEmail",
      channel: "email",
    });
  });

  test("管理者向け登録・確定・稼働促進・不達digestを受け付ける", async () => {
    const seed = seedManagerScenario<ShopSeed>("testing:seedNotificationManagerDigestScenario", {
      dates: getNextWeekDates(),
    });
    assertNotificationDeliverySuppressed(seed.shopId);

    const trigger = convexRunJson<{ scheduledPurposeCount: number }>(
      "testing:triggerNotificationManagerDigestScenario",
      {
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
      },
    );
    expect(trigger.scheduledPurposeCount).toBe(4);

    for (const notificationContext of MANAGER_DIGEST_CONTEXTS) {
      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        notificationContext,
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext,
        deliverySuppressed: true,
        hasUserTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);
      await assertNoNotificationOutbox({
        shopId: seed.shopId,
        notificationContext,
        channel: "line",
      });
    }

    const cleanup = convexRunJson<{ resolvedCount: number }>("testing:resolveE2EFailureFixtures", {
      shopId: seed.shopId,
    });
    expect(cleanup.resolvedCount).toBe(1);
  });

  test("LINE連携済み管理者へ登録・確定・稼働促進・不達digestを受け付ける", async () => {
    const seed = seedManagerScenario<ShopSeed>("testing:seedNotificationManagerDigestScenario", {
      dates: getNextWeekDates(),
      managerLineState: "following",
    });
    assertNotificationDeliverySuppressed(seed.shopId);

    const trigger = convexRunJson<{ scheduledPurposeCount: number }>(
      "testing:triggerNotificationManagerDigestScenario",
      {
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
      },
    );
    expect(trigger.scheduledPurposeCount).toBe(4);

    for (const notificationContext of MANAGER_DIGEST_CONTEXTS) {
      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        notificationContext,
        channel: "line",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "line",
        notificationContext,
        deliverySuppressed: true,
        hasUserTarget: true,
      });
      expect(probe.failureInbox).toHaveLength(0);
      await assertNoNotificationOutbox({
        shopId: seed.shopId,
        notificationContext,
        channel: "email",
      });
    }

    const cleanup = convexRunJson<{ resolvedCount: number }>("testing:resolveE2EFailureFixtures", {
      shopId: seed.shopId,
    });
    expect(cleanup.resolvedCount).toBe(1);
  });
});
