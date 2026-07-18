import { test } from "../fixtures/e2eTest";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { OrganizationSettingsPage } from "../pages/OrganizationSettingsPage";

const PRIMARY_SHOP_NAME = "複数店舗E2E A店";
const SECONDARY_SHOP_NAME = "複数店舗E2E B店";
const RENAMED_SECONDARY_SHOP_NAME = "複数店舗E2E B店 更新後";

type SingleShopSeed = {
  shopId: string;
};

test.describe("グループの店舗追加・切り替え・編集", { tag: ["@release"] }, () => {
  test.setTimeout(75_000);

  test("MS-P0-01: B店の追加と編集をreload後も維持し、A店へ混入させない", async ({ page }) => {
    const seed = seedManagerScenario<SingleShopSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: PRIMARY_SHOP_NAME,
    });
    const dashboard = new DashboardPage(page);
    const settings = new OrganizationSettingsPage(page);
    let secondaryShopId = "";

    await test.step("Step 1: A店のグループ設定からB店を追加する", async () => {
      await settings.goto(seed.shopId, "shops");
      await settings.addShop(SECONDARY_SHOP_NAME);
      await settings.expectShopVisible(PRIMARY_SHOP_NAME);
      await settings.expectShopVisible(SECONDARY_SHOP_NAME);
    });

    await test.step("Step 2: DashboardでB店へ切り替え、B店だけを編集する", async () => {
      await dashboard.goto(seed.shopId);
      await dashboard.expectSelectedShop(PRIMARY_SHOP_NAME, seed.shopId);
      secondaryShopId = await dashboard.switchShop(SECONDARY_SHOP_NAME);
      await dashboard.editShopSettings({ shopName: RENAMED_SECONDARY_SHOP_NAME });
      await dashboard.expectSelectedShop(RENAMED_SECONDARY_SHOP_NAME, secondaryShopId);
    });

    await test.step("Step 3: reload後もB店を維持し、A店が変更されていないことを確認する", async () => {
      await page.reload();
      await dashboard.expectSelectedShop(RENAMED_SECONDARY_SHOP_NAME, secondaryShopId);
      await dashboard.switchShop(PRIMARY_SHOP_NAME, seed.shopId);
      await dashboard.expectSelectedShop(PRIMARY_SHOP_NAME, seed.shopId);
    });
  });
});
