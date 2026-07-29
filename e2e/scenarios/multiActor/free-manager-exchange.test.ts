import { expect, test } from "../../fixtures/multiActorTest";
import { isManagerInvitationEnabled } from "../../helpers/featureFlags";
import { waitForManagerInvitationTokenProbe } from "../../helpers/managerInvitationProbe";
import { waitForOrganizationNotificationOutbox } from "../../helpers/notificationProbe";
import { seedFreeManagerMultiOrganizationScenario } from "../../helpers/scenarioSeeds";
import { DashboardPage } from "../../pages/DashboardPage";
import { ManagerInvitationPage } from "../../pages/ManagerInvitationPage";
import { OrganizationSettingsPage } from "../../pages/OrganizationSettingsPage";

test.describe("Free管理者交代", { tag: ["@release", "@notification", "@security"] }, () => {
  test.setTimeout(90_000);

  test("MM-P0-04: 送信前に交代結果を確認し、前任者のスタッフ所属と別グループ権限を維持する", async ({
    actorA,
    actorB,
    multiActorPool,
  }) => {
    test.skip(!isManagerInvitationEnabled(), "管理者の招待・交代はダークローンチ中で、この環境では公開していない");

    const seed = seedFreeManagerMultiOrganizationScenario(multiActorPool, {
      targetOrganizationName: "Free管理者交代E2Eグループ",
      targetShopName: "Free管理者交代E2E店舗",
      actorBName: "Free後任管理者B",
      alternateOrganizationName: "前任者A別グループ",
      alternateShopName: "前任者A別店舗",
    });
    const settingsA = new OrganizationSettingsPage(actorA.page);
    const settingsB = new OrganizationSettingsPage(actorB.page);
    const dashboardA = new DashboardPage(actorA.page);
    const dashboardB = new DashboardPage(actorB.page);
    const invitationB = new ManagerInvitationPage(actorB.page);
    const targetShopNameManagedByA = `${seed.targetShopName} A管理確認`;
    const targetShopNameManagedByB = `${seed.targetShopName} B管理確認`;
    const updatedAlternateShopName = `${seed.alternateShopName} 更新確認`;
    let invitationToken = "";

    await test.step("Step 1: Aが送信前確認を経て既存スタッフBへ交代案内を送る", async () => {
      await settingsA.goto(seed.targetShopId);
      await settingsA.expectOrganization(seed.targetOrganizationName);
      await settingsA.openFreeManagerExchangeConfirmation(seed.actorBName);
      await settingsA.confirmFreeManagerExchange();

      const probe = await waitForOrganizationNotificationOutbox({
        organizationId: seed.targetOrganizationId,
        notificationContext: "organizationInvitation.enqueueManagerInvitation",
        channel: "email",
      });
      expect(probe.outbox).toHaveLength(1);
      expect(probe.outbox[0]).toMatchObject({
        organizationId: seed.targetOrganizationId,
        purpose: "business",
        channel: "email",
        deliverySuppressed: true,
        invitationVersionMatchesTarget: true,
        hasRecognizedCta: true,
      });
      const invitationId = probe.outbox[0]?.organizationInvitationId;
      if (!invitationId) throw new Error("Free管理者交代通知に招待IDがありません");
      const token = await waitForManagerInvitationTokenProbe({
        organizationId: seed.targetOrganizationId,
        invitationId,
      });
      invitationToken = token.token;
    });

    await test.step("Step 2: Bの連携完了まではAが対象グループを管理できる", async () => {
      await dashboardA.goto(seed.targetShopId);
      await dashboardA.editShopSettings({ shopName: targetShopNameManagedByA });
      await dashboardA.expectSelectedShop(targetShopNameManagedByA, seed.targetShopId);

      await settingsA.goto(seed.targetShopId);
      await settingsA.expectOrganization(seed.targetOrganizationName);
      await settingsA.expectPersonRole(seed.actorBName, "スタッフ", { hasPendingManagerInvitation: true });
    });

    await test.step("Step 3: Bが現行の自動連携で唯一の管理者になる", async () => {
      await invitationB.acceptAndExpectDashboard(invitationToken, seed.targetShopId);
      await dashboardB.expectSelectedShop(targetShopNameManagedByA, seed.targetShopId);
      await dashboardB.expectStaffVisible(seed.actorAName);
      await dashboardB.editShopSettings({ shopName: targetShopNameManagedByB });
      await dashboardB.expectSelectedShop(targetShopNameManagedByB, seed.targetShopId);

      await settingsB.goto(seed.targetShopId);
      await settingsB.expectOrganization(seed.targetOrganizationName);
      await settingsB.expectPersonRole(seed.actorAName, "スタッフ");
    });

    await test.step("Step 4: Aは対象グループだけを失効し、別グループを引き続き管理できる", async () => {
      await actorA.page.reload();
      await dashboardA.expectInvalidShop();
      await expect(actorA.page).toHaveURL(new RegExp(`shop=${seed.targetShopId}(?:&|$)`));

      await dashboardA.goto(seed.alternateShopId);
      await dashboardA.expectSelectedShop(seed.alternateShopName, seed.alternateShopId);
      await dashboardA.editShopSettings({ shopName: updatedAlternateShopName });
      await dashboardA.expectSelectedShop(updatedAlternateShopName, seed.alternateShopId);
    });
  });
});
