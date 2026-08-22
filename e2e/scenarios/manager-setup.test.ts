import { test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { resetCurrentManagerScenarioData } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";

// manager emailを入力するため、画面状態をartifactへ保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("管理者の初期設定", { tag: ["@e2e-core"] }, () => {
  test.setTimeout(45_000);

  test("[E2E-SETUP-01] 新規管理者が1組織1店舗のTrial利用状態でDashboardへ到達する", async ({ e2eClerkUser, page }) => {
    await resetCurrentManagerScenarioData();
    const dashboard = new DashboardPage(page);
    const shopName = "E2E初期設定店舗";

    await dashboard.goto();
    await dashboard.completeSetup({
      shopName,
      shiftStartTime: "10:00",
      shiftEndTime: "23:00",
      managerName: "田中太郎",
      managerEmail: e2eClerkUser,
    });
    await dashboard.expectSetupComplete();
    await dashboard.expectShopAvailable(shopName);
    const scope = await dashboard.readCanonicalScope();
    await dashboard.expectSelectedShop(shopName, scope.organizationId, scope.shopId);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expectAppHydrated(page);
    await dashboard.expectShopAvailable(shopName);
    await dashboard.expectSelectedShop(shopName, scope.organizationId, scope.shopId);
    await dashboard.expectInitialTrialScopeInManagement(scope.organizationId, shopName);
  });
});
