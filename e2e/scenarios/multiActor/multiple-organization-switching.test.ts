import { test } from "../../fixtures/multiActorTest";
import { seedFreeManagerMultiOrganizationScenario } from "../../helpers/scenarioSeeds";
import { DashboardPage } from "../../pages/DashboardPage";
import { OrganizationSettingsPage } from "../../pages/OrganizationSettingsPage";

test.describe("複数グループ切り替え", { tag: ["@release", "@security"] }, () => {
  test.setTimeout(75_000);

  test("MG-P0-01: 同じ管理者が無関係な2グループを往復し、表示と更新を混入させない", async ({
    actorA,
    multiActorPool,
  }) => {
    const seed = seedFreeManagerMultiOrganizationScenario(multiActorPool, {
      targetOrganizationName: "複数グループE2E Aグループ",
      targetShopName: "複数グループE2E A店舗",
      actorBName: "Aグループ固有スタッフ",
      alternateOrganizationName: "複数グループE2E Bグループ",
      alternateShopName: "複数グループE2E B店舗",
    });
    const updatedAlternateShopName = "複数グループE2E B店舗 更新後";
    const dashboard = new DashboardPage(actorA.page);
    const settings = new OrganizationSettingsPage(actorA.page);

    await test.step("Step 1: DashboardでAグループからBグループへ切り替える", async () => {
      await dashboard.goto(seed.targetShopId);
      await dashboard.expectSelectedShop(seed.targetShopName, seed.targetShopId);
      await dashboard.expectStaffVisible(seed.actorBName);
      await dashboard.expectOrganizationGroupsInShopSwitcher([
        seed.targetOrganizationName,
        seed.alternateOrganizationName,
      ]);

      await dashboard.switchShop(seed.alternateShopName, seed.alternateShopId);
      await dashboard.expectStaffVisible(seed.actorAName);
      await dashboard.expectStaffNotVisible(seed.actorBName);
    });

    await test.step("Step 2: Bグループの店舗名だけを更新し、reload後も維持する", async () => {
      await dashboard.editShopSettings({ shopName: updatedAlternateShopName });
      await dashboard.expectSelectedShop(updatedAlternateShopName, seed.alternateShopId);
      await actorA.page.reload();
      await dashboard.expectSelectedShop(updatedAlternateShopName, seed.alternateShopId);
      await dashboard.expectStaffNotVisible(seed.actorBName);
    });

    await test.step("Step 3: Aグループへ戻り、Bグループの表示と更新が混入していない", async () => {
      await dashboard.switchShop(seed.targetShopName, seed.targetShopId);
      await dashboard.expectSelectedShop(seed.targetShopName, seed.targetShopId);
      await dashboard.expectStaffVisible(seed.actorBName);
    });

    await test.step("Step 4: グループ設定でもA/Bを往復し、それぞれの代表店舗を維持する", async () => {
      await settings.goto(seed.targetShopId);
      await settings.expectOrganization(seed.targetOrganizationName);
      await settings.expectPersonVisible(seed.actorBName);

      await settings.switchOrganization(seed.alternateOrganizationName, seed.alternateShopId);
      await settings.expectShopVisible(updatedAlternateShopName);
      await settings.openPeopleTab();
      await settings.expectPersonVisible(seed.actorAName);
      await settings.expectPersonNotVisible(seed.actorBName);

      await settings.switchOrganization(seed.targetOrganizationName, seed.targetShopId);
      await settings.expectShopVisible(seed.targetShopName);
      await settings.openPeopleTab();
      await settings.expectPersonVisible(seed.actorBName);
    });
  });
});
