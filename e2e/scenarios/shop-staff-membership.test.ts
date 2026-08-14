import { test } from "../fixtures/e2eTest";
import {
  resetShopStaffMembershipScenario,
  seedShopStaffMembershipScenario,
} from "../helpers/shopStaffMembershipScenario";
import { DashboardPage } from "../pages/DashboardPage";
import { ShopStaffMembershipPage } from "../pages/ShopStaffMembershipPage";

// 所属変更Dialogへperson nameが表示されるため、browser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("店舗の所属スタッフ変更", { tag: ["@e2e-core"] }, () => {
  test.setTimeout(60_000);

  test.afterEach(async () => {
    await resetShopStaffMembershipScenario();
  });

  test("[E2E-MEMBERSHIP-01] 対象店舗の所属スタッフを追加・解除し、元店舗の所属を維持する", async ({ page }) => {
    const seed = seedShopStaffMembershipScenario();
    const membership = new ShopStaffMembershipPage(page);
    const dashboard = new DashboardPage(page);

    await membership.openTargetShopFromManagement(seed);
    await membership.expectInitialTargetStaffList(seed);
    await membership.addCandidate(seed);
    await membership.expectCandidateAdded(seed);
    await membership.openCandidateStaffDetailAndReturn(seed);
    await membership.reloadAndExpectCandidateSelected(seed);
    await membership.removeAddedCandidate(seed);
    await membership.expectCandidateRemoved(seed);
    await membership.reloadAndExpectCandidateRemoved(seed);

    await dashboard.goto({ organizationId: seed.organizationId, shopId: seed.contextShopId });
    await dashboard.expectStaffVisible(seed.additionCandidateName);
  });
});
