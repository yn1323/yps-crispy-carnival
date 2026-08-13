import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { resetCurrentManagerScenarioData, seedManagerScenario } from "../helpers/scenarioSeeds";
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
  test.setTimeout(60_000);

  test.afterEach(async () => {
    await resetCurrentManagerScenarioData();
  });

  test("[E2E-SHOP-01] 店舗を追加して設定を変更し、再読込後に追加店舗だけを削除する", async ({ page }) => {
    const seed = seedManagerScenario<ShopLifecycleScenarioSeed>("testing:seedShopLifecycleScenario", {
      organizationName: "E2E 店舗管理グループ",
      shopName: "E2E 元店舗",
    });
    const addedShopName = "E2E 追加店舗";
    const updatedShopName = "E2E 更新店舗";
    const lifecycle = new ShopLifecyclePage(page);
    const dashboard = new DashboardPage(page);

    await lifecycle.gotoSettings(seed.shopId);
    await lifecycle.addShop(addedShopName);

    await dashboard.goto(seed.shopId);
    const addedShopId = await dashboard.switchShopAndReadId(addedShopName);
    assertNotificationDeliverySuppressed(addedShopId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(page);
    await dashboard.expectSelectedShop(addedShopName, addedShopId);

    await dashboard.openCurrentShopDetail(addedShopId);
    await lifecycle.updateCurrentShopSettings(addedShopName, updatedShopName);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(page);
    await lifecycle.expectCurrentShopSettings(updatedShopName);
    await lifecycle.deleteCurrentShop(updatedShopName);

    await dashboard.expectSingleShopContext(seed.shopName, seed.shopId);
    await expect(page).toHaveURL(
      (url) => !url.pathname.includes(addedShopId) && ![...url.searchParams.values()].includes(addedShopId),
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(page);
    await dashboard.expectSingleShopContext(seed.shopName, seed.shopId);

    await lifecycle.gotoSettings(seed.shopId);
    await lifecycle.expectShopListed(seed.shopName);
    await lifecycle.expectShopAbsent(updatedShopName);
  });
});
