import { test } from "../fixtures/e2eTest";
import { isBillingEnabled, isOrganizationCreationEnabled, isShopAdditionEnabled } from "../helpers/featureFlags";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { OrganizationSettingsPage } from "../pages/OrganizationSettingsPage";

const FIRST_SHOP_NAME = "グループ作成E2E 一つ目の店舗";
const SECOND_SHOP_NAME = "グループ作成E2E 二つ目の店舗";
const FIRST_GROUP_STAFF_NAME = "一つ目グループ固有スタッフ";

type SingleShopSeed = {
  shopId: string;
};

test.describe("新しいグループの作成", { tag: ["@release"] }, () => {
  test.setTimeout(90_000);

  test("MG-P0-02: 画面から作った二つ目のグループを無料で開始し、一つ目のデータへ混入させない", async ({ page }) => {
    test.skip(!isOrganizationCreationEnabled(), "グループ追加はダークローンチ中で、この環境では公開していない");

    const seed = seedManagerScenario<SingleShopSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: FIRST_SHOP_NAME,
      existingStaff: { name: FIRST_GROUP_STAFF_NAME, email: "first-group-staff@example.com" },
    });
    const dashboard = new DashboardPage(page);
    const settings = new OrganizationSettingsPage(page);
    let secondShopId = "";

    await test.step("Step 1: 一つ目のグループ設定から新しいグループを作る", async () => {
      await settings.goto(seed.shopId);
      await settings.expectOrganization(`${FIRST_SHOP_NAME}グループ`);
      secondShopId = await settings.createOrganization(SECOND_SHOP_NAME);
      // 画面操作で作った店舗にも、E2E managerのdry-run判定による配送抑止が効いている。
      assertNotificationDeliverySuppressed(secondShopId);
    });

    await test.step("Step 2: 作成直後に新しいグループの店舗でDashboardを開ける", async () => {
      await dashboard.expectSelectedShop(SECOND_SHOP_NAME, secondShopId);
      await dashboard.expectStaffNotVisible(FIRST_GROUP_STAFF_NAME);
    });

    await test.step("Step 3: 店舗切り替えに両方のグループが並ぶ", async () => {
      await dashboard.expectOrganizationGroupsInShopSwitcher([`${FIRST_SHOP_NAME}グループ`, SECOND_SHOP_NAME]);
    });

    await test.step("Step 4: 新しいグループは無料で始まり、一つ目のプランは変わらない", async () => {
      await settings.goto(secondShopId);
      await settings.expectOrganization(SECOND_SHOP_NAME);
      await settings.expectShopVisible(SECOND_SHOP_NAME);
      await settings.expectShopNotVisible(FIRST_SHOP_NAME);
      await settings.expectBillingPlan("無料");
      await settings.expectBillingUsage("利用人数", 1, 5);
      await settings.expectBillingUsage("店舗数", 1, 1);
      await settings.expectBillingUsage("管理者数", 1, 1);

      await settings.goto(seed.shopId);
      await settings.expectComplimentaryBusiness();
    });

    await test.step("Step 5: reload後も新しいグループの店舗を選択したままにする", async () => {
      await dashboard.goto(secondShopId);
      await dashboard.expectSelectedShop(SECOND_SHOP_NAME, secondShopId);
      await page.reload();
      await dashboard.expectSelectedShop(SECOND_SHOP_NAME, secondShopId);
      await dashboard.expectStaffNotVisible(FIRST_GROUP_STAFF_NAME);
    });

    await test.step("Step 6: 一つ目のグループのスタッフとプランは残っている", async () => {
      await dashboard.switchShop(FIRST_SHOP_NAME, seed.shopId);
      await dashboard.expectStaffVisible(FIRST_GROUP_STAFF_NAME);
    });
  });

  // 公開状態にかかわらず常に実行する。
  // `.env`とdeploymentの設定がずれた場合は、ここで落ちて検知できる。
  test("MG-P0-03: ダークローンチの公開状態と、グループ設定に出る導線が一致する", async ({ page }) => {
    const seed = seedManagerScenario<SingleShopSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: FIRST_SHOP_NAME,
      existingStaff: { name: FIRST_GROUP_STAFF_NAME, email: "first-group-staff@example.com" },
    });
    const settings = new OrganizationSettingsPage(page);

    await settings.goto(seed.shopId);
    await settings.expectFeatureEntrypoints({
      organizationCreation: isOrganizationCreationEnabled(),
      shopAddition: isShopAdditionEnabled(),
      billing: isBillingEnabled(),
    });
  });
});
