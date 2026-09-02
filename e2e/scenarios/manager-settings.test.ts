import { test } from "../fixtures/e2eTest";
import { resetManagerSettingsScenario, seedManagerSettingsScenario } from "../helpers/managerSettingsScenario";
import { ManagerSettingsPage } from "../pages/ManagerSettingsPage";

// 管理者と招待先の氏名・メールアドレスを扱うため、成功・失敗を問わずbrowser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("管理者設定", { tag: ["@e2e-core"] }, () => {
  test.setTimeout(60_000);

  test.afterEach(async () => {
    await resetManagerSettingsScenario();
  });

  test("[E2E-MANAGER-01] 既存スタッフを招待し再読込後に取り消して管理へ戻る", async ({ page }) => {
    const seed = seedManagerSettingsScenario();
    const managerSettings = new ManagerSettingsPage(page);

    await managerSettings.openFromOrganizationSettings(seed);
    await managerSettings.inviteExistingStaff(seed);
    await managerSettings.reloadAndExpectInvitationPending(seed);
    await managerSettings.revokeInvitation(seed);
    await managerSettings.returnToManagement(seed);
  });
});
