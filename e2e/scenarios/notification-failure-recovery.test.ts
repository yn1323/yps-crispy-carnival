import { expect, test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed, getNotificationProbe } from "../helpers/notificationProbe";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { NotificationFailureDialogPage } from "../pages/NotificationFailureDialogPage";

const MANAGER_NAME = "田中太郎";
const SECOND_STAFF_NAME = "通知不達スタッフ";
const NOTIFICATION_CONTEXT = "notification.sendRecruitmentNotificationEmails";

type FailureRecoverySeed = {
  shopId: string;
  recruitmentId: string;
};

test.describe("通知不達Dashboardからの再通知", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(45_000);

  test("個別再通知後に残りを一斉再通知し、受付状態へ戻せる", async ({ page }) => {
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
    });

    await test.step("Step 2: 1件を個別に再通知する", async () => {
      await failures.resend(MANAGER_NAME);
    });

    await test.step("Step 3: 残りを一斉再通知する", async () => {
      await failures.resendAll();
      await failures.expectAllAccepted();
    });

    await test.step("Step 4: outboxとFailureInboxが再通知受付状態になっている", async () => {
      const probe = getNotificationProbe({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        notificationContext: NOTIFICATION_CONTEXT,
        channel: "email",
      });
      expect(probe.outbox).toHaveLength(2);
      expect(probe.outbox.every((job) => ["pending", "processing", "sent"].includes(job.status))).toBe(true);
      expect(probe.outbox.every((job) => job.deliverySuppressed)).toBe(true);
      expect(probe.failureInbox).toHaveLength(2);
      expect(probe.failureInbox.every((failure) => ["retrying", "resolved"].includes(failure.status))).toBe(true);
    });
  });
});
