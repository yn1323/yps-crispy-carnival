import { expect, test } from "../../fixtures/multiActorTest";
import { waitForManagerInvitationTokenProbe } from "../../helpers/managerInvitationProbe";
import { waitForOrganizationNotificationOutbox } from "../../helpers/notificationProbe";
import { seedMultiActorOrganizationScenario } from "../../helpers/scenarioSeeds";
import { DashboardPage } from "../../pages/DashboardPage";
import { ManagerInvitationPage } from "../../pages/ManagerInvitationPage";
import { OrganizationSettingsPage } from "../../pages/OrganizationSettingsPage";

test.describe("管理者権限だけの解除", { tag: ["@release", "@security"] }, () => {
  test.setTimeout(75_000);

  test("MM-P0-02: Bの管理画面権限だけを外し、A店のスタッフ所属を維持する", async ({
    actorA,
    actorB,
    multiActorPool,
  }) => {
    const seed = seedMultiActorOrganizationScenario(multiActorPool, {
      organizationName: "権限解除E2Eグループ",
      primaryShopName: "権限解除E2E A店",
      secondaryShopName: "権限解除E2E B店",
      actorBName: "権限解除対象B",
    });
    const settingsA = new OrganizationSettingsPage(actorA.page);
    const dashboardA = new DashboardPage(actorA.page);
    const dashboardB = new DashboardPage(actorB.page);
    const invitationB = new ManagerInvitationPage(actorB.page);

    await test.step("Step 1: AがBを管理者として招待し、Bが対象グループへ連携する", async () => {
      await settingsA.goto(seed.primaryShopId);
      await settingsA.inviteExistingStaffAsManager(seed.actorBName);
      const probe = await waitForOrganizationNotificationOutbox({
        organizationId: seed.primaryOrganizationId,
        notificationContext: "organizationInvitation.enqueueManagerInvitation",
        channel: "email",
      });
      const invitationId = probe.outbox[0]?.organizationInvitationId;
      if (!invitationId) throw new Error("管理者招待通知に招待IDがありません");
      const token = await waitForManagerInvitationTokenProbe({
        organizationId: seed.primaryOrganizationId,
        invitationId,
      });
      await invitationB.acceptAndExpectDashboard(token.token, seed.primaryShopId);
      await dashboardB.expectSelectedShop(seed.primaryShopName, seed.primaryShopId);
    });

    await test.step("Step 2: AがBの管理者権限だけを外し、スタッフ表示を残す", async () => {
      await settingsA.goto(seed.primaryShopId);
      await settingsA.removeManagerRole(seed.actorBName);
      await settingsA.expectPersonRole(seed.actorBName, "スタッフ");

      await dashboardA.goto(seed.primaryShopId);
      await dashboardA.expectStaffVisible(seed.actorBName);
    });

    await test.step("Step 3: Bの主グループURLは汎用エラーになり、別グループへ黙ってfallbackしない", async () => {
      await actorB.page.reload();
      await dashboardB.expectInvalidShop();
      await expect(actorB.page).toHaveURL(new RegExp(`shop=${seed.primaryShopId}(?:&|$)`));

      await actorB.page.goto(`/settings?shop=${seed.primaryShopId}`);
      await dashboardB.expectInvalidShop();
      await expect(actorB.page).toHaveURL(new RegExp(`shop=${seed.primaryShopId}(?:&|$)`));

      await dashboardB.goto(seed.alternateShopId);
      await dashboardB.expectSelectedShop(seed.alternateShopName, seed.alternateShopId);
    });
  });
});
