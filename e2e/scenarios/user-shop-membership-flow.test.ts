import { test } from "../fixtures/e2eTest";
import { isShopAdditionEnabled } from "../helpers/featureFlags";
import { seedMultiShopOrganizationScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";

test.describe("ユーザー詳細の店舗所属管理", { tag: ["@release", "@security"] }, () => {
  test.setTimeout(60_000);

  test("MS-P0-04: 選択店舗を維持したまま専用ページで店舗所属を追加・解除できる", async ({ page }) => {
    test.skip(!isShopAdditionEnabled(), "店舗所属追加はダークローンチ中のためスキップします");
    const seed = seedMultiShopOrganizationScenario({
      organizationName: "ユーザー所属E2Eグループ",
      primaryShopName: "ユーザー所属E2E A店",
      secondaryShopName: "ユーザー所属E2E B店",
      primaryMarkerPersonName: "ユーザー所属変更対象",
      primaryMarkerPersonEmail: "user-membership-primary@shiftori.invalid",
    });
    const dashboard = new DashboardPage(page);
    const primaryShop = { id: seed.primaryShopId, name: seed.primaryShopName };
    const secondaryShop = { id: seed.secondaryShopId, name: seed.secondaryShopName };

    await dashboard.goto(seed.primaryShopId);
    let detail = await dashboard.openUserDetail(seed.primaryMarkerPersonName);

    await test.step("Step 1: ユーザー詳細には所属中のA店だけを表示する", async () => {
      await detail.expectAssignedShop(primaryShop);
      await detail.expectShopNotAssigned(secondaryShop);
      await detail.expectShopPageStructure(primaryShop, primaryShop);
    });

    await test.step("Step 2: 店舗追加ダイアログから未所属のB店へ追加する", async () => {
      await detail.addShop(secondaryShop);
      await detail.expectAssignedShop(secondaryShop);
    });

    await test.step("Step 3: A店を選択したままB店の専用ページから店舗所属だけを解除する", async () => {
      await detail.expectShopPageStructure(secondaryShop, primaryShop);
      await detail.removeFromShop(secondaryShop);
      await detail.expectAssignedShop(primaryShop);
    });

    await test.step("Step 4: Dashboardへ戻ってもA店の選択と所属を維持する", async () => {
      await detail.returnToDashboard();
      await dashboard.expectStaffVisible(seed.primaryMarkerPersonName);
      detail = await dashboard.openUserDetail(seed.primaryMarkerPersonName);
      await detail.expectAssignedShop(primaryShop);
      await detail.expectShopNotAssigned(secondaryShop);
    });
  });
});
