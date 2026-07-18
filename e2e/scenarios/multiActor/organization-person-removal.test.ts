import { expect, test } from "../../fixtures/multiActorTest";
import { waitForManagerInvitationTokenProbe } from "../../helpers/managerInvitationProbe";
import { waitForOrganizationNotificationOutbox } from "../../helpers/notificationProbe";
import { seedMultiActorOrganizationScenario } from "../../helpers/scenarioSeeds";
import { DashboardPage } from "../../pages/DashboardPage";
import { ManagerInvitationPage } from "../../pages/ManagerInvitationPage";
import { OrganizationSettingsPage } from "../../pages/OrganizationSettingsPage";

test.describe("グループからの利用者削除", { tag: ["@release", "@security"] }, () => {
  test.setTimeout(75_000);

  test("MM-P0-03: Bを主グループから削除してもBの別グループ所属を維持する", async ({ actorA, actorB }) => {
    const seed = seedMultiActorOrganizationScenario({
      organizationName: "利用者削除E2E主グループ",
      primaryShopName: "利用者削除E2E A店",
      secondaryShopName: "利用者削除E2E B店",
      actorBName: "グループ削除対象B",
      alternateOrganizationName: "利用者削除E2E別グループ",
      alternateShopName: "利用者削除E2E別店舗",
    });
    const settingsA = new OrganizationSettingsPage(actorA.page);
    const dashboardA = new DashboardPage(actorA.page);
    const dashboardB = new DashboardPage(actorB.page);
    const invitationB = new ManagerInvitationPage(actorB.page);

    await test.step("Step 1: AがBを管理者として招待し、Bが主グループへ連携する", async () => {
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

    await test.step("Step 2: AがBを主グループから削除し、全店舗の表示から除外する", async () => {
      await settingsA.goto(seed.primaryShopId);
      await settingsA.removePerson(seed.actorBName);
      await settingsA.expectPersonNotVisible(seed.actorBName);

      await dashboardA.goto(seed.primaryShopId);
      await dashboardA.expectStaffNotVisible(seed.actorBName);
      await dashboardA.switchShop(seed.secondaryShopName, seed.secondaryShopId);
      await dashboardA.expectStaffNotVisible(seed.actorBName);
    });

    await test.step("Step 3: Bは主グループを開けず、明示した別グループの店舗は引き続き開ける", async () => {
      await actorB.page.reload();
      await dashboardB.expectInvalidShop();
      await expect(actorB.page).toHaveURL(new RegExp(`shop=${seed.primaryShopId}(?:&|$)`));

      await dashboardB.goto(seed.alternateShopId);
      await dashboardB.expectSelectedShop(seed.alternateShopName, seed.alternateShopId);
    });
  });
});
