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
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

const ADDED_STAFF = {
  name: "追加スタッフ",
  email: "added-staff@example.com",
};

const MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

type OpenRecruitmentSeed = {
  shopId: string;
  recruitmentId: string;
};

test.describe("募集中の追加スタッフ通知", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(75_000);

  test("募集中にスタッフを追加すると、そのスタッフの希望提出リンクが発行される", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
    });
    const dashboard = new DashboardPage(page);
    const submitPage = new StaffSubmitPage(page);

    await test.step("Step 1: 募集中の店舗にスタッフを追加する", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      await dashboard.goto();
      await dashboard.addStaffs([ADDED_STAFF]);
      await dashboard.expectStaffVisible(ADDED_STAFF.name);
    });

    await test.step("Step 2: 追加スタッフ向けの希望提出リンクから提出できる", async () => {
      for (const notificationContext of ["legal.sendStaffConsentEmail", "line.sendInviteEmail"] as const) {
        const supportingProbe = await waitForNotificationOutbox({
          shopId: seed.shopId,
          staffEmail: ADDED_STAFF.email,
          notificationContext,
          channel: "email",
        });
        expect(supportingProbe.outbox[0]).toMatchObject({
          channel: "email",
          notificationContext,
          deliverySuppressed: true,
          hasStaffTarget: true,
        });
        expect(["pending", "processing", "sent"]).toContain(supportingProbe.outbox[0].status);
        expect(supportingProbe.failureInbox).toHaveLength(0);
      }

      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: ADDED_STAFF.email,
        notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaff",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaff",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      const token = await waitForMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: ADDED_STAFF.email,
        purpose: "submit",
      });
      await submitPage.goto(token.token);
      await submitPage.expectFormVisible();
      await submitPage.expectUnsubmittedBadge();
      await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
      await submitPage.acceptLegalConsent();
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });
  });

  test("LINE follow時に募集中シフトの希望提出リンクが発行される", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      managerLineState: "unfollowed",
      managerLegalConsentState: "missing",
      managerStaffLegalConsentState: "missing",
    });
    const submitPage = new StaffSubmitPage(page);

    await test.step("Step 1: 本番Webhookと同じfollow処理を予約する", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      const result = convexRunJson<{ scheduled: boolean }>("testing:simulateLineFollowForStaff", {
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
      });
      expect(result.scheduled).toBe(true);
    });

    await test.step("Step 2: 法務同意LINEと募集LINEが両方受け付けられる", async () => {
      const legalProbe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
        notificationContext: "legal.sendStaffConsentEmail",
        channel: "line",
      });
      expect(legalProbe.outbox[0]).toMatchObject({
        channel: "line",
        deliverySuppressed: true,
        hasStaffTarget: true,
      });
      expect(legalProbe.failureInbox).toHaveLength(0);
      await assertNoNotificationOutbox({
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
        notificationContext: "legal.sendStaffConsentEmail",
        channel: "email",
      });

      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: MANAGER.email,
        notificationContext: "line:openRecruitment",
        channel: "line",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "line",
        notificationContext: "line:openRecruitment",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);
      await assertNoNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: MANAGER.email,
        channel: "email",
      });

      const token = await waitForMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
        purpose: "submit",
      });
      await submitPage.goto(token.token);
      await submitPage.expectFormVisible();
      await submitPage.expectUnsubmittedBadge();
    });
  });
});
