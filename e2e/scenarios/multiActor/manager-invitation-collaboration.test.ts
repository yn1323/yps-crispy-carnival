import { expect, test } from "../../fixtures/multiActorTest";
import { convexRunJson } from "../../helpers/convex";
import { getNextWeekDates } from "../../helpers/date";
import { waitForManagerInvitationTokenProbe } from "../../helpers/managerInvitationProbe";
import {
  assertNoNotificationOutbox,
  fingerprintNotificationRecipient,
  waitForNotificationOutbox,
  waitForOrganizationNotificationOutbox,
} from "../../helpers/notificationProbe";
import { seedMultiActorOrganizationScenario } from "../../helpers/scenarioSeeds";
import { DashboardPage } from "../../pages/DashboardPage";
import { ManagerInvitationPage } from "../../pages/ManagerInvitationPage";
import { OrganizationSettingsPage } from "../../pages/OrganizationSettingsPage";
import { StaffRegistrationPage } from "../../pages/StaffRegistrationPage";

test.describe("複数管理者の招待と共同管理", { tag: ["@release", "@notification", "@security"] }, () => {
  test.setTimeout(120_000);

  test("MM-P0-01 / REG-P0-03: Cの本人不一致後にBが共同管理し、代表digestを受け取る", async ({
    actorA,
    actorB,
    actorC,
    browser,
  }) => {
    const seed = seedMultiActorOrganizationScenario({
      organizationName: "共同管理E2Eグループ",
      primaryShopName: "共同管理E2E A店",
      secondaryShopName: "共同管理E2E B店",
      actorBName: "共同管理者B",
      actorCName: "不一致利用者C",
    });
    const settingsA = new OrganizationSettingsPage(actorA.page);
    const dashboardA = new DashboardPage(actorA.page);
    const dashboardB = new DashboardPage(actorB.page);
    const invitationB = new ManagerInvitationPage(actorB.page);
    const invitationC = new ManagerInvitationPage(actorC.page);
    const expectedManagerRecipientFingerprints = [seed.ownerUserId, seed.actorBUserId]
      .map(fingerprintNotificationRecipient)
      .sort();
    let invitationToken = "";

    await test.step("Step 1: AがA店の既存スタッフBへ管理者のログイン案内を送る", async () => {
      await settingsA.goto(seed.primaryShopId);
      await settingsA.expectOrganization(seed.organizationName);
      await settingsA.inviteExistingStaffAsManager(seed.actorBName);

      const probe = await waitForOrganizationNotificationOutbox({
        organizationId: seed.primaryOrganizationId,
        notificationContext: "organizationInvitation.enqueueManagerInvitation",
        channel: "email",
      });
      expect(probe.outbox).toHaveLength(1);
      expect(probe.outbox[0]).toMatchObject({
        organizationId: seed.primaryOrganizationId,
        purpose: "business",
        channel: "email",
        deliverySuppressed: true,
        invitationVersionMatchesTarget: true,
        hasRecognizedCta: true,
      });
      const invitationId = probe.outbox[0].organizationInvitationId;
      if (!invitationId) throw new Error("管理者招待通知に招待IDがありません");
      const tokenProbe = await waitForManagerInvitationTokenProbe({
        organizationId: seed.primaryOrganizationId,
        invitationId,
      });
      expect({ invitationId: tokenProbe.invitationId, status: tokenProbe.status }).toEqual({
        invitationId,
        status: "issued",
      });
      expect(tokenProbe.expiresAt).toBeGreaterThan(Date.now());
      invitationToken = tokenProbe.token;
    });

    await test.step("Step 2: 招待先と異なるCでは連携できず、同じtokenをBが利用できる", async () => {
      await invitationC.expectEmailMismatch(invitationToken);
      await invitationB.acceptAndExpectDashboard(invitationToken, seed.primaryShopId);
      await dashboardB.expectSelectedShop(seed.primaryShopName, seed.primaryShopId);
    });

    await test.step("Step 3: 連携完了通知をA/Bの2件へ受け付け、店舗付き設定CTAを維持する", async () => {
      const probe = await waitForOrganizationNotificationOutbox(
        {
          organizationId: seed.primaryOrganizationId,
          expectedShopId: seed.primaryShopId,
          notificationContext: "organizationInvitation.linked",
          channel: "email",
        },
        { expectedOutboxCount: 2 },
      );
      expect(probe.outbox).toHaveLength(2);
      expect(probe.outbox.map((job) => job.recipientUserFingerprint).sort()).toEqual(
        expectedManagerRecipientFingerprints,
      );
      for (const job of probe.outbox) {
        expect(job).toMatchObject({
          organizationId: seed.primaryOrganizationId,
          purpose: "business",
          channel: "email",
          deliverySuppressed: true,
          hasRecognizedCta: true,
          ctaShopMatchesTarget: true,
        });
      }
    });

    await test.step("Step 4: BがB店で募集を作成し、A/B双方からB店だけに見える", async () => {
      await dashboardB.switchShop(seed.secondaryShopName, seed.secondaryShopId);
      await dashboardB.createRecruitment(getNextWeekDates());
      await dashboardB.expectRecruitmentCardCount(1);

      await dashboardB.switchShop(seed.primaryShopName, seed.primaryShopId);
      await dashboardB.expectRecruitmentCardCount(0);
      await dashboardB.switchShop(seed.secondaryShopName, seed.secondaryShopId);
      await dashboardB.expectRecruitmentCardCount(1);

      await dashboardA.goto(seed.primaryShopId);
      await dashboardA.expectRecruitmentCardCount(0);
      await dashboardA.switchShop(seed.secondaryShopName, seed.secondaryShopId);
      await dashboardA.expectRecruitmentCardCount(1);
    });

    await test.step("Step 5: B店のスタッフ登録digestをA/Bへ一件ずつ受け付ける", async () => {
      await dashboardB.goto(seed.secondaryShopId);
      const registrationToken = await dashboardB.getStaffRegistrationToken();
      const staffContext = await browser.newContext({ baseURL: "http://localhost:3000" });
      try {
        const registrationPage = new StaffRegistrationPage(await staffContext.newPage());
        await registrationPage.goto(registrationToken);
        await registrationPage.expectShopName(seed.secondaryShopName);
        await registrationPage.submitRequest({
          name: "複数管理者digest申請者",
          email: "multi-manager-digest@shiftori.invalid",
        });
      } finally {
        await staffContext.close();
      }

      const trigger = convexRunJson<{ scheduledPurposeCount: number }>(
        "testing:triggerStaffRegistrationManagerDigestScenario",
        { shopId: seed.secondaryShopId },
      );
      expect(trigger.scheduledPurposeCount).toBe(1);
      const probe = await waitForNotificationOutbox(
        {
          shopId: seed.secondaryShopId,
          notificationContext: "staffRegistration.sendOwnerDailyDigest",
          channel: "email",
        },
        { expectedOutboxCount: 2 },
      );
      expect(probe.outbox).toHaveLength(2);
      expect(probe.outbox.map((job) => job.recipientUserFingerprint).sort()).toEqual(
        expectedManagerRecipientFingerprints,
      );
      for (const job of probe.outbox) {
        expect(job).toMatchObject({
          channel: "email",
          notificationContext: "staffRegistration.sendOwnerDailyDigest",
          deliverySuppressed: true,
          hasUserTarget: true,
          ctaShopMatchesTarget: true,
        });
      }
      expect(probe.failureInbox).toHaveLength(0);
      await assertNoNotificationOutbox({
        shopId: seed.secondaryShopId,
        notificationContext: "staffRegistration.sendOwnerDailyDigest",
        channel: "line",
      });
    });
  });
});
