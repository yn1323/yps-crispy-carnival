import { test } from "../fixtures/e2eTest";
import { isBillingEnabled } from "../helpers/featureFlags";
import { resetCurrentManagerScenarioData, seedTrialEndingNoticeScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { OrganizationSettingsPage } from "../pages/OrganizationSettingsPage";

const DAY_MS = 24 * 60 * 60 * 1_000;

test.describe("トライアル終了前の支払い案内", { tag: ["@release"] }, () => {
  test.setTimeout(60_000);

  test.afterEach(() => {
    resetCurrentManagerScenarioData();
  });

  test("BILL-P0-01: 全店舗で案内し、選択中店舗を保って支払い設定へ移動する", async ({ page }) => {
    // 案内の遷移先が支払いタブのため、支払いを公開していない間は成立しない。
    test.skip(!isBillingEnabled(), "支払いはダークローンチ中で、この環境では公開していない");
    const seed = seedTrialEndingNoticeScenario({
      trialEndsAt: Date.now() + 6 * DAY_MS,
      organizationName: "トライアル終了案内E2Eグループ",
      primaryShopName: "トライアル終了案内E2E A店",
      secondaryShopName: "トライアル終了案内E2E B店",
    });
    const dashboard = new DashboardPage(page);
    const settings = new OrganizationSettingsPage(page);

    await test.step("Step 1: A店のDashboardに支払い案内を表示する", async () => {
      await dashboard.goto(seed.primaryShopId);
      await dashboard.expectSelectedShop(seed.primaryShopName, seed.primaryShopId);
      await dashboard.expectTrialEndingNoticeVisible();
    });

    await test.step("Step 2: 同じグループのB店でも支払い案内を表示する", async () => {
      await dashboard.switchShop(seed.secondaryShopName, seed.secondaryShopId);
      await dashboard.expectTrialEndingNoticeVisible();
    });

    await test.step("Step 3: B店を保ったままグループ設定の支払いタブへ移動する", async () => {
      await dashboard.openTrialEndingNoticeBilling();
      await settings.expectBillingTabSelected(seed.secondaryShopId);
    });
  });
});
