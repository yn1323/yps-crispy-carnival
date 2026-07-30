import { expect, test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed, getNotificationProbe } from "../helpers/notificationProbe";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { NotificationFailureDialogPage } from "../pages/NotificationFailureDialogPage";

const MANAGER_NAME = "田中太郎";
const SECOND_STAFF_NAME = "通知不達スタッフ";
const THIRD_STAFF_NAME = "通知不達スタッフ2";
const NOTIFICATION_CONTEXT = "notification.sendRecruitmentNotificationEmails";

type FailureRecoverySeed = {
  shopId: string;
  recruitmentId: string;
};

test.describe("送れなかった通知のDashboard対応", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(45_000);

  test("無視・個別再通知・一斉再通知を使い分けられる", async ({ page }) => {
    const seed = seedManagerScenario<FailureRecoverySeed>("testing:seedNotificationFailureRecoveryScenario", {
      dates: getNextWeekDates(),
    });
    const dashboard = new DashboardPage(page);
    const failures = new NotificationFailureDialogPage(page);

    await test.step("Step 1: Dashboardで送れなかった通知を確認する", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      await dashboard.goto();
      await failures.open();
      await failures.expectFailureVisible(MANAGER_NAME);
      await failures.expectFailureVisible(SECOND_STAFF_NAME);
      await failures.expectFailureVisible(THIRD_STAFF_NAME);
    });

    await test.step("Step 2: 1件を無視して一覧から外す", async () => {
      await failures.ignore(MANAGER_NAME);
    });

    await test.step("Step 3: 1件を個別に再通知する", async () => {
      await failures.resend(SECOND_STAFF_NAME);
    });

    await test.step("Step 4: 残りを一斉再通知する", async () => {
      await failures.resendAll();
      await failures.expectAcceptedCount(2);
    });

    await test.step("Step 5: 無視した通知は再送せず、残りだけ再通知受付状態になっている", async () => {
      const probe = getNotificationProbe({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        notificationContext: NOTIFICATION_CONTEXT,
        channel: "email",
      });
      const outboxStates = probe.outbox
        .map((job) => ({
          state: job.status === "failed" ? "original-failed" : "retry-accepted",
          deliverySuppressed: job.deliverySuppressed,
        }))
        .sort((left, right) => left.state.localeCompare(right.state));
      expect(outboxStates).toEqual([
        { state: "original-failed", deliverySuppressed: true },
        { state: "retry-accepted", deliverySuppressed: true },
        { state: "retry-accepted", deliverySuppressed: true },
      ]);
      expect(probe.failureInbox.map((failure) => failure.status).sort()).toEqual(["resolved", "retrying", "retrying"]);
      expect(probe.duplicateDedupeKeyCount).toBe(0);
    });
  });
});
