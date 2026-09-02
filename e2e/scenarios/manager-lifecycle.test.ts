import {
  resetManagerLifecycleScenario,
  seedManagerLifecycleScenario,
  waitForManagerInvitationCapability,
} from "../helpers/managerLifecycleScenario";
import { multiActorTest as test } from "../helpers/multiActorSession";
import { DashboardPage } from "../pages/DashboardPage";
import { ManagerInvitationAcceptancePage } from "../pages/ManagerInvitationAcceptancePage";
import { ManagerSettingsPage } from "../pages/ManagerSettingsPage";

// 招待capability、Clerk session、氏名、メールアドレスをbrowser artifactへ保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("管理者の招待受諾と権限解除", { tag: ["@e2e-core", "@capability"] }, () => {
  // fresh Clerk session、2つのbrowser context、capability発行を含む契約の失敗上限。
  test.setTimeout(90_000);

  test.afterEach(async () => {
    await resetManagerLifecycleScenario();
  });

  test("[E2E-MANAGER-02] 招待を別アカウントで受諾し、権限解除後もスタッフ所属を維持する", async ({
    e2eReservedManagerSession,
    page,
  }) => {
    const seed = seedManagerLifecycleScenario(e2eReservedManagerSession.actor);
    const inviterSettings = new ManagerSettingsPage(page);
    const inviteeSettings = new ManagerSettingsPage(e2eReservedManagerSession.page);
    const inviteeAcceptance = new ManagerInvitationAcceptancePage(e2eReservedManagerSession.page);
    const inviterDashboard = new DashboardPage(page);

    await test.step("管理者Aが既存スタッフBを管理者として招待する", async () => {
      await inviterSettings.openFromOrganizationSettings(seed);
      await inviterSettings.inviteExistingStaff(seed);
    });

    const capability = await waitForManagerInvitationCapability(seed);

    await test.step("別のClerkアカウントBが招待を受諾し管理者設定へ到達する", async () => {
      await inviteeAcceptance.acceptAndExpectDashboard(capability.token, seed);
      await inviteeSettings.openDirectly(seed.organizationId);
      await inviteeSettings.expectActiveManager(seed);
    });

    await test.step("管理者AがBの管理者権限を外す", async () => {
      await inviterSettings.reloadAndExpectActiveManager(seed);
      await inviterSettings.removeManagerRole(seed);
    });

    await test.step("Bは管理者設定へ戻れないがスタッフ所属は維持される", async () => {
      await inviteeSettings.expectAccessRevoked(seed.organizationId);
      await inviterDashboard.goto({ organizationId: seed.organizationId, shopId: seed.shopId });
      await inviterDashboard.expectStaffVisible(seed.candidateName);
    });
  });
});
