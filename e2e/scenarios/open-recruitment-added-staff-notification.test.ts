import { expect, test } from "../fixtures/e2eTest";
import { convexRunJson } from "../helpers/convex";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import {
  assertNoNotificationOutbox,
  assertNotificationDeliverySuppressed,
  waitForNotificationOutbox,
} from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario, seedMultiShopOrganizationScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

type OpenRecruitmentSeed = {
  shopId: string;
  recruitmentId: string;
};

test.describe("募集中の追加スタッフ通知", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(90_000);

  test("MS-P0-02: A店スタッフをB店へ再利用し、B店の希望提出まで完了できる", async ({ browser, page }) => {
    const dates = getNextWeekDates();
    const seed = seedMultiShopOrganizationScenario({
      primaryShopName: "他店舗スタッフ再利用E2E A店",
      secondaryShopName: "他店舗スタッフ再利用E2E B店",
      primaryMarkerPersonName: "他店舗再利用スタッフ",
      primaryMarkerPersonEmail: "ms-p0-02-reused@shiftori.invalid",
      secondaryMarkerPersonName: "B店既存スタッフ",
      secondaryMarkerPersonEmail: "ms-p0-02-secondary@shiftori.invalid",
    });
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: B店で募集を開始し、A店スタッフを他店舗候補から追加する", async () => {
      assertNotificationDeliverySuppressed(seed.secondaryShopId);
      await dashboard.goto(seed.secondaryShopId);
      await dashboard.expectSelectedShop(seed.secondaryShopName, seed.secondaryShopId);
      await dashboard.expectStaffVisible(seed.secondaryMarkerPersonName);
      await dashboard.expectStaffNotVisible(seed.primaryMarkerPersonName);
      await dashboard.createRecruitment(dates);
      await dashboard.addOrganizationStaff(seed.primaryMarkerPersonName, seed.primaryShopName);
      await dashboard.expectStaffVisible(seed.primaryMarkerPersonName);
      await dashboard.expectOrganizationStaffNotCandidate(seed.primaryMarkerPersonName);
    });

    await test.step("Step 2: A店所属が残り、B店にも同じ人物が表示される", async () => {
      await dashboard.goto(seed.primaryShopId);
      await dashboard.expectSelectedShop(seed.primaryShopName, seed.primaryShopId);
      await dashboard.expectStaffVisible(seed.primaryMarkerPersonName);
      await dashboard.expectStaffNotVisible(seed.secondaryMarkerPersonName);

      await dashboard.goto(seed.secondaryShopId);
      await dashboard.expectSelectedShop(seed.secondaryShopName, seed.secondaryShopId);
      await dashboard.expectStaffVisible(seed.primaryMarkerPersonName);
    });

    await test.step("Step 3: 再利用スタッフ向けのB店通知から希望を提出できる", async () => {
      for (const notificationContext of ["legal.sendStaffConsentEmail", "line.sendInviteEmail"] as const) {
        const supportingProbe = await waitForNotificationOutbox({
          shopId: seed.secondaryShopId,
          staffEmail: seed.primaryMarkerPersonEmail,
          notificationContext,
          channel: "email",
        });
        expect(supportingProbe.outbox[0]).toMatchObject({
          channel: "email",
          notificationContext,
          deliverySuppressed: true,
          hasStaffTarget: true,
          ctaTokenMatchesTarget: true,
        });
        expect(["pending", "processing", "sent"]).toContain(supportingProbe.outbox[0].status);
        expect(supportingProbe.failureInbox).toHaveLength(0);
      }

      const probe = await waitForNotificationOutbox({
        shopId: seed.secondaryShopId,
        staffEmail: seed.primaryMarkerPersonEmail,
        notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaff",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "notification.sendOpenRecruitmentNotificationEmailsForStaff",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
        ctaTokenMatchesTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      const token = await waitForMagicLinkToken({
        shopId: seed.secondaryShopId,
        staffEmail: seed.primaryMarkerPersonEmail,
        purpose: "submit",
      });
      expect(token.recruitmentId).toBeTruthy();

      for (const notificationContext of [
        "legal.sendStaffConsentEmail",
        "line.sendInviteEmail",
        "notification.sendOpenRecruitmentNotificationEmailsForStaff",
      ]) {
        await assertNoNotificationOutbox({
          shopId: seed.primaryShopId,
          staffEmail: seed.primaryMarkerPersonEmail,
          notificationContext,
        });
      }

      const staffContext = await browser.newContext({ baseURL: "http://localhost:3000" });
      const submitPage = new StaffSubmitPage(await staffContext.newPage());
      try {
        await submitPage.goto(token.token);
        await submitPage.expectFormVisible();
        await submitPage.expectUnsubmittedBadge();
        await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
        await submitPage.acceptLegalConsent();
        await submitPage.submit();
        await submitPage.expectCompletionVisible();
      } finally {
        await staffContext.close();
      }
    });
  });

  test("LINE follow時に募集中シフトの希望提出リンクが発行される", async ({ page, e2eClerkUser }) => {
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
        staffEmail: e2eClerkUser,
      });
      expect(result.scheduled).toBe(true);
    });

    await test.step("Step 2: 法務同意LINEと募集LINEが両方受け付けられる", async () => {
      const legalProbe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        staffEmail: e2eClerkUser,
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
        staffEmail: e2eClerkUser,
        notificationContext: "legal.sendStaffConsentEmail",
        channel: "email",
      });

      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: e2eClerkUser,
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
        staffEmail: e2eClerkUser,
        channel: "email",
      });

      const token = await waitForMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: e2eClerkUser,
        purpose: "submit",
      });
      await submitPage.goto(token.token);
      await submitPage.expectFormVisible();
      await submitPage.expectUnsubmittedBadge();
    });
  });
});
