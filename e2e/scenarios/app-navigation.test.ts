import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { resetCurrentManagerScenarioData, seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppStaffPage } from "../pages/AppStaffPage";
import { DashboardPage } from "../pages/DashboardPage";

type AppNavigationScenarioSeed = {
  organizationId: string;
  shopId: string;
  shopName: string;
  managerName: string;
};

// スタッフ画面には管理者の人物情報が含まれるため、browser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("新appのメインナビゲーション", { tag: ["@e2e-core"] }, () => {
  // canonical遷移と旧URLからのreplace・履歴復帰を確認するため、3 workerのcold実測へ余裕を加えた失敗上限。
  test.setTimeout(75_000);

  test.afterEach(async () => {
    await resetCurrentManagerScenarioData();
  });

  test("[E2E-NAV-01] canonical URLで移動し旧URLを履歴に残さず置き換える", async ({ page }) => {
    const seed = seedManagerScenario<AppNavigationScenarioSeed>("testing:seedShopLifecycleScenario", {
      organizationName: "E2E ナビゲーション組織",
      shopName: "E2E ナビゲーション店舗",
    });

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto({ organizationId: seed.organizationId, shopId: seed.shopId });
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

    await test.step("旧URLのdirect loadをcanonical URLへreplaceする", async () => {
      await dashboardPage.goto({ organizationId: seed.organizationId, shopId: seed.shopId });
      await page.goto(`/app/staff?org=${encodeURIComponent(seed.organizationId)}`, {
        waitUntil: "domcontentloaded",
      });
      await expectAppHydrated(page);
      await staffPage.expectReady({
        organizationId: seed.organizationId,
        personName: seed.managerName,
        shopName: seed.shopName,
      });

      await page.goBack({ waitUntil: "domcontentloaded" });
      await expectAppHydrated(page);
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === "/dashboard" &&
          url.searchParams.get("org") === seed.organizationId &&
          url.searchParams.get("shop") === seed.shopId,
      );
      await expect(page.getByRole("button", { name: "新しい募集をつくる" })).toBeVisible();
    });
  });
});
