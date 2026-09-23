import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { getNextWeekDates } from "../helpers/date";
import { getCurrentE2EClerkUser } from "../helpers/e2eUsers";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { forceResetManagerScenarioData, seedManagerScenario } from "../helpers/scenarioSeeds";
import { ActionInboxPage } from "../pages/ActionInboxPage";
import { DashboardPage } from "../pages/DashboardPage";

type NotificationFailureSeed = {
  organizationId: string;
  shopId: string;
  retryStaffName: string;
  dismissStaffName: string;
};

// スタッフの氏名を表示するため、画面状態を保存し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("送れなかった通知への対応", { tag: ["@e2e-core"] }, () => {
  // Dashboard、確認Dialog、再読込、要対応一覧を含む。3-worker実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(60_000);

  // 意図して作った不達が再送処理の途中で残るため、次のseedの監査に掛けず、自分のactorのgraphだけを監査なしで回収する。
  test.afterEach(() => {
    forceResetManagerScenarioData(getCurrentE2EClerkUser().index);
  });

  test("[E2E-NOTIFY-01] 送れなかった通知を再送・破棄すると、Dashboardと要対応一覧から外れる", async ({ page }) => {
    const seed = seedManagerScenario<NotificationFailureSeed>("testing:seedNotificationFailureScenario", {
      dates: getNextWeekDates(),
    });
    assertNotificationDeliverySuppressed(seed.shopId);
    const dashboard = new DashboardPage(page);
    const inbox = new ActionInboxPage(page);

    await test.step("Dashboardの要対応で1件を再送し、1件を破棄する", async () => {
      await dashboard.goto({ organizationId: seed.organizationId, shopId: seed.shopId });
      await inbox.openDashboardTask("送れなかった通知が2件あります");
      await inbox.runPrimaryAction(seed.retryStaffName, "再送する");
      await inbox.dismissNotificationFailure(seed.dismissStaffName);
    });

    await test.step("再読込後もDashboardと要対応一覧に表示されない", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectAppHydrated(page);
      await expect(page.getByRole("button", { name: "新しい募集をつくる" })).toBeVisible();
      await inbox.expectDashboardTaskAbsent(/^送れなかった通知が\d+件あります$/);

      await inbox.gotoActions(seed.organizationId);
      await inbox.expectActionsEmpty();
      await inbox.expectCardAbsent(seed.retryStaffName);
      await inbox.expectCardAbsent(seed.dismissStaffName);
    });
  });
});
