import { expect, test } from "../fixtures/e2eTest";
import { seedMultiShopOrganizationScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { OrganizationSettingsPage } from "../pages/OrganizationSettingsPage";

test.describe("グループ設定からの店舗削除", { tag: ["@release", "@security"] }, () => {
  test.setTimeout(60_000);

  test("MS-P0-03: 選択中のB店を削除し、B店専属スタッフを店舗所属なしで維持する", async ({ page }) => {
    const seed = seedMultiShopOrganizationScenario({
      organizationName: "店舗削除E2Eグループ",
      primaryShopName: "店舗削除E2E A店",
      secondaryShopName: "店舗削除E2E B店",
    });
    const dashboard = new DashboardPage(page);
    const settings = new OrganizationSettingsPage(page);

    await test.step("Step 1: B店の削除確認をキャンセルするとB店が残る", async () => {
      await dashboard.goto(seed.secondaryShopId);
      await dashboard.expectSelectedShop(seed.secondaryShopName, seed.secondaryShopId);
      await settings.goto(seed.secondaryShopId, "shops");
      await settings.expectPersonShopNames(seed.secondaryMarkerPersonName, [seed.secondaryShopName]);
      await settings.cancelShopDeletion(seed.secondaryShopName);
      await settings.expectShopVisible(seed.secondaryShopName);
    });

    await test.step("Step 2: 選択中のB店を削除すると、別店舗へfallbackせず汎用エラーになる", async () => {
      await settings.deleteShop(seed.secondaryShopName);
      await dashboard.expectInvalidShop();
      await expect(page).toHaveURL(new RegExp(`shop=${seed.secondaryShopId}(?:&|$)`));
    });

    await test.step("Step 3: 戻る操作でA店へ復旧し、B店を切替候補に残さない", async () => {
      await dashboard.returnFromInvalidShop();
      await dashboard.expectSelectedShop(seed.primaryShopName, seed.primaryShopId);
      await dashboard.expectShopNotSelectable(seed.secondaryShopName, seed.primaryShopName, seed.primaryShopId);
    });

    await test.step("Step 4: B店専属スタッフを店舗所属なしのユーザーとして維持する", async () => {
      await settings.goto(seed.primaryShopId);
      await settings.expectPersonShopNames(seed.secondaryMarkerPersonName, []);
    });

    await test.step("Step 5: 削除済みB店の旧URLでも店舗名や業務画面を露出しない", async () => {
      await dashboard.goto(seed.secondaryShopId);
      await dashboard.expectInvalidShop();
      await expect(page.getByText(seed.secondaryShopName, { exact: true })).toHaveCount(0);
    });
  });
});
