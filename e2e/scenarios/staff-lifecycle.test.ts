import { test } from "../fixtures/e2eTest";
import {
  createUpdatedStaffLifecycleEmail,
  resetStaffLifecycleScenario,
  seedStaffLifecycleScenario,
} from "../helpers/staffLifecycleScenario";
import { StaffLifecyclePage } from "../pages/StaffLifecyclePage";

// 氏名とメールアドレスを扱うため、成功・失敗を問わずbrowser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("スタッフライフサイクル", { tag: ["@e2e-core"] }, () => {
  test.setTimeout(60_000);

  test.afterEach(async () => {
    await resetStaffLifecycleScenario();
  });

  test("[E2E-STAFF-01] スタッフを追加・変更し、再読込後に組織から削除する", async ({ page }) => {
    const seed = seedStaffLifecycleScenario();
    const updatedStaffName = `${seed.staffName} 更新`;
    const updatedStaffEmail = createUpdatedStaffLifecycleEmail(seed.staffEmail);
    const lifecycle = new StaffLifecyclePage(page);

    await lifecycle.gotoDashboard(seed.shopId);
    await lifecycle.addManualStaff(seed.staffName, seed.staffEmail);
    await lifecycle.openStaffDetail(seed.staffName, seed.shopId);
    await lifecycle.updateStaffProfile(
      { name: seed.staffName, email: seed.staffEmail },
      { name: updatedStaffName, email: updatedStaffEmail },
    );
    await lifecycle.reloadAndExpectStaffProfile(updatedStaffName, updatedStaffEmail);
    await lifecycle.removeStaffFromOrganization(updatedStaffName, seed.shopId);
    await lifecycle.reloadAndExpectStaffAbsent(updatedStaffName);
  });
});
