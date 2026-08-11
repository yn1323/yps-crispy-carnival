import { test } from "../fixtures/e2eTest";
import {
  resetShopStaffMembershipScenario,
  seedShopStaffMembershipScenario,
} from "../helpers/shopStaffMembershipScenario";
import { ShopStaffMembershipPage } from "../pages/ShopStaffMembershipPage";

// 所属変更Dialogへperson emailが表示されるため、browser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("店舗の所属スタッフ変更", { tag: ["@e2e-core"] }, () => {
  test.setTimeout(60_000);

  test.afterEach(async () => {
    await resetShopStaffMembershipScenario();
  });

  test("[E2E-MEMBERSHIP-01] 対象店舗の所属スタッフを一括変更し再読込後も維持する", async ({ page }) => {
    const seed = seedShopStaffMembershipScenario();
    const membership = new ShopStaffMembershipPage(page);

    await membership.openTargetShopFromOrganizationSettings(seed);
    await membership.expectInitialTargetStaffList(seed);
    await membership.addCandidate(seed);
    await membership.expectCandidateAdded(seed);
    await membership.reloadAndExpectCandidateSelected(seed);
    await membership.removeAddedCandidate(seed);
    await membership.expectCandidateRemoved(seed);
    await membership.reloadAndExpectCandidateRemoved(seed);
  });
});
