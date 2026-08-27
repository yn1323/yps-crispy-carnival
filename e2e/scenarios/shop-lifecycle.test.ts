import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { resetCurrentManagerScenarioData, seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ShopLifecyclePage } from "../pages/ShopLifecyclePage";

type ShopLifecycleScenarioSeed = {
  organizationId: string;
  shopId: string;
  shopName: string;
};

// Dashboardへmanager emailが表示されるため、browser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("同一組織の店舗ライフサイクル", { tag: ["@e2e-core"] }, () => {
  // 複数routeで店舗追加・設定変更・削除・再訪を確認するため、3 workerのcold実測へ余裕を加えた失敗上限。
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await resetCurrentManagerScenarioData();
  });

  test("[E2E-SHOP-01] 店舗を追加してシフトfilterへ反映し、設定変更後に追加店舗だけを削除する", async ({ page }) => {
    const seed = seedManagerScenario<ShopLifecycleScenarioSeed>("testing:seedShopLifecycleScenario", {
      organizationName: "E2E 店舗管理グループ",
      shopName: "E2E 元店舗",
    });
    const addedShopName = "E2E 追加店舗";
    const updatedShopName = "E2E 更新店舗";
    const lifecycle = new ShopLifecyclePage(page);
    const appShifts = new AppShiftsPage(page);
    const dashboard = new DashboardPage(page);

    await lifecycle.gotoManagement(seed.organizationId);
    await lifecycle.addShop(addedShopName);

    await dashboard.goto({ organizationId: seed.organizationId, shopId: seed.shopId });
    await dashboard.expectSelectedShop(seed.shopName, seed.organizationId, seed.shopId);
    const addedShopId = await dashboard.switchShopAndReadId(addedShopName, seed.organizationId);
    assertNotificationDeliverySuppressed(addedShopId);

    await test.step("追加店舗がシフト画面の全店舗filterへ反映される", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.expectDefaultAllFilter();
      await appShifts.selectShopFilter(addedShopName, addedShopId);
    });

    await dashboard.goto({ organizationId: seed.organizationId, shopId: addedShopId });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(page);
    await dashboard.expectSelectedShop(addedShopName, seed.organizationId, addedShopId);

    await dashboard.openCurrentShopDetail(seed.organizationId, addedShopId);
    await lifecycle.updateCurrentShopSettings(addedShopName, updatedShopName);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(page);
    await lifecycle.expectCurrentShopSettings(updatedShopName);
    await lifecycle.deleteCurrentShop(updatedShopName);
    await lifecycle.expectManagementReady(seed.organizationId);
    await lifecycle.expectShopListed(seed.shopName);
    await lifecycle.expectShopAbsent(updatedShopName);

    await dashboard.goto({ organizationId: seed.organizationId, shopId: seed.shopId });
    await dashboard.expectSingleShopContext(seed.shopName, seed.organizationId, seed.shopId);
    await expect(page).toHaveURL(
      (url) => !url.pathname.includes(addedShopId) && ![...url.searchParams.values()].includes(addedShopId),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(page);
    await dashboard.expectSingleShopContext(seed.shopName, seed.organizationId, seed.shopId);

    await lifecycle.gotoManagement(seed.organizationId);
    await lifecycle.expectShopListed(seed.shopName);
    await lifecycle.expectShopAbsent(updatedShopName);
  });
});
