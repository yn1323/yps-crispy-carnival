import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { resetCurrentManagerScenarioData, seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppStaffPage } from "../pages/AppStaffPage";

type AppNavigationScenarioSeed = {
  organizationId: string;
  shopId: string;
  shopName: string;
  managerName: string;
};

// スタッフ画面には管理者の人物情報が含まれるため、browser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("新appのメインナビゲーション", { tag: ["@e2e-core"] }, () => {
  test.setTimeout(45_000);

  test.afterEach(async () => {
    await resetCurrentManagerScenarioData();
  });

  test("[E2E-NAV-01] 組織scopeを保ってスタッフへ移動し実人物rowを表示する", async ({ page }) => {
    const seed = seedManagerScenario<AppNavigationScenarioSeed>("testing:seedShopLifecycleScenario", {
      organizationName: "E2E ナビゲーション組織",
      shopName: "E2E ナビゲーション店舗",
    });

    await page.goto(
      `/app/home?org=${encodeURIComponent(seed.organizationId)}&shop=${encodeURIComponent(seed.shopId)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expectAppHydrated(page);
    const staffPage = new AppStaffPage(page);

    const navigation = page.getByRole("navigation", { name: "メインメニュー" });
    const staffLink = navigation.getByRole("link", { name: "スタッフ", exact: true });
    await staffLink.click();

    await staffPage.expectReady({
      organizationId: seed.organizationId,
      personName: seed.managerName,
      shopName: seed.shopName,
    });
    await expect(staffLink).toHaveAttribute("aria-current", "page");
  });
});
