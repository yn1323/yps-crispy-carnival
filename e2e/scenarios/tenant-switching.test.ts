import { test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { seedSingleActorMultiOrganizationScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";

// Dashboardへmanager emailが表示されるため、browser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("複数グループ切り替え", { tag: ["@e2e-core"] }, () => {
  test.setTimeout(45_000);

  test("[E2E-TENANT-01] 同じ管理者が2グループを往復し選択店舗の表示を切り替える", async ({ page }) => {
    const seed = seedSingleActorMultiOrganizationScenario({
      targetOrganizationName: "E2E Aグループ",
      targetShopName: "E2E A店舗",
      actorBName: "Aグループ固有スタッフ",
      alternateOrganizationName: "E2E Bグループ",
      alternateShopName: "E2E B店舗",
    });
    const dashboard = new DashboardPage(page);

    await dashboard.goto({ organizationId: seed.targetOrganizationId, shopId: seed.targetShopId });
    await dashboard.expectSelectedShop(seed.targetShopName, seed.targetOrganizationId, seed.targetShopId);
    await dashboard.expectStaffVisible(seed.actorBName);

    await dashboard.switchOrganization(
      seed.alternateOrganizationName,
      seed.alternateOrganizationId,
      seed.alternateShopName,
      seed.alternateShopId,
    );
    await dashboard.expectSelectedShop(seed.alternateShopName, seed.alternateOrganizationId, seed.alternateShopId);
    await dashboard.expectStaffNotVisible(seed.actorBName);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(page);
    await dashboard.expectSelectedShop(seed.alternateShopName, seed.alternateOrganizationId, seed.alternateShopId);
    await dashboard.expectStaffVisible(seed.actorAName);
    await dashboard.expectStaffNotVisible(seed.actorBName);

    await dashboard.switchOrganization(
      seed.targetOrganizationName,
      seed.targetOrganizationId,
      seed.targetShopName,
      seed.targetShopId,
    );
    await dashboard.expectSelectedShop(seed.targetShopName, seed.targetOrganizationId, seed.targetShopId);
    await dashboard.expectStaffVisible(seed.actorBName);
  });
});
