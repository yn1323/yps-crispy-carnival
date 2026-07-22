import { expect, test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import {
  assertNoNotificationOutbox,
  assertNotificationDeliverySuppressed,
  waitForNotificationOutbox,
} from "../helpers/notificationProbe";
import { waitForFreshMagicLinkToken, waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffViewPage } from "../pages/StaffViewPage";

const MANAGER = {
  name: "田中太郎",
};

type ConfirmationScenarioSeed = {
  shopId: string;
  recruitmentId: string;
};

test.describe("通知URL起点の確定シフト閲覧", { tag: ["@release", "@notification"] }, () => {
  test.setTimeout(75_000);

  test("確定URLで閲覧し、使用済みURLから再発行した新URLでも閲覧できる", async ({ browser, page, e2eClerkUser }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ConfirmationScenarioSeed>("testing:seedNotificationConfirmationViewScenario", {
      dates,
    });
    const dashboard = new DashboardPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const staffView = new StaffViewPage(page);

    const viewToken = await test.step("Step 1: 管理者が確定し、通知受付と閲覧URL発行を確認する", async () => {
      assertNotificationDeliverySuppressed(seed.shopId);
      await dashboard.goto();
      await dashboard.openShiftBoard();
      await shiftBoard.confirm(1);

      const probe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: e2eClerkUser,
        notificationContext: "notification.sendConfirmationEmail",
        channel: "email",
      });
      expect(probe.outbox[0]).toMatchObject({
        channel: "email",
        notificationContext: "notification.sendConfirmationEmail",
        deliverySuppressed: true,
        hasRecruitmentTarget: true,
        hasStaffTarget: true,
      });
      expect(["pending", "processing", "sent"]).toContain(probe.outbox[0].status);
      expect(probe.failureInbox).toHaveLength(0);

      return await waitForMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: e2eClerkUser,
        purpose: "view",
      });
    });

    await test.step("Step 2: スタッフが確定シフトURLから閲覧できる", async () => {
      await staffView.goto(viewToken.token);
      await staffView.expectShiftViewVisible();
      await staffView.expectStaffVisible(MANAGER.name);
      await staffView.expectShiftTimeVisible();
    });

    await test.step("Step 3: 別ブラウザでは使用済みURLになり、再発行通知の新URLで閲覧できる", async () => {
      // 同じ browser context だと localStorage の staff session が残るため、
      // 使用済みmagic linkの挙動は新規 context で確認する。
      const isolated = await browser.newContext({ baseURL: "http://localhost:3000" });
      const isolatedPage = await isolated.newPage();
      const isolatedView = new StaffViewPage(isolatedPage);

      try {
        await isolatedView.goto(viewToken.token);
        await isolatedView.expectExpiredVisible();
        await isolatedView.requestReissue(e2eClerkUser);

        const reissueProbe = await waitForNotificationOutbox({
          shopId: seed.shopId,
          staffEmail: e2eClerkUser,
          notificationContext: "notification.sendReissueEmail",
          channel: "email",
        });
        expect(reissueProbe.outbox[0]).toMatchObject({
          channel: "email",
          notificationContext: "notification.sendReissueEmail",
          deliverySuppressed: true,
          hasStaffTarget: true,
        });
        expect(["pending", "processing", "sent"]).toContain(reissueProbe.outbox[0].status);
        expect(reissueProbe.failureInbox).toHaveLength(0);

        const reissuedToken = await waitForFreshMagicLinkToken({
          recruitmentId: seed.recruitmentId,
          shopId: seed.shopId,
          staffEmail: e2eClerkUser,
          purpose: "view",
          previousToken: viewToken.token,
        });
        await isolatedView.goto(reissuedToken.token);
        await isolatedView.expectShiftViewVisible();
        await isolatedView.expectStaffVisible(MANAGER.name);
        await isolatedView.expectShiftTimeVisible();
      } finally {
        await isolated.close();
      }
    });
  });

  test("LINE連携済みスタッフへ確定通知と閲覧link再発行を受け付ける", async ({ browser, page, e2eClerkUser }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ConfirmationScenarioSeed>("testing:seedNotificationConfirmationViewScenario", {
      dates,
      managerLineState: "following",
    });
    const dashboard = new DashboardPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const staffView = new StaffViewPage(page);

    assertNotificationDeliverySuppressed(seed.shopId);
    await dashboard.goto();
    await dashboard.openShiftBoard();
    await shiftBoard.confirm(1);

    const confirmationProbe = await waitForNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: e2eClerkUser,
      notificationContext: "notification.sendConfirmationEmail",
      channel: "line",
    });
    expect(confirmationProbe.outbox[0]).toMatchObject({
      channel: "line",
      notificationContext: "notification.sendConfirmationEmail",
      deliverySuppressed: true,
      hasRecruitmentTarget: true,
      hasStaffTarget: true,
    });
    expect(confirmationProbe.failureInbox).toHaveLength(0);
    await assertNoNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: e2eClerkUser,
      notificationContext: "notification.sendConfirmationEmail",
      channel: "email",
    });

    await shiftBoard.replaceShift(
      MANAGER.name,
      { startTime: "10:00", endTime: "18:00" },
      { startTime: "11:00", endTime: "18:00" },
    );
    await shiftBoard.notifyChangedStaff();
    const changedProbe = await waitForNotificationOutbox(
      {
        shopId: seed.shopId,
        recruitmentId: seed.recruitmentId,
        staffEmail: e2eClerkUser,
        notificationContext: "notification.sendConfirmationEmail",
        channel: "line",
      },
      { expectedOutboxCount: 2 },
    );
    expect(changedProbe.outbox.map((job) => job.isResend)).toEqual([true, false]);
    expect(changedProbe.outbox[0]).toMatchObject({
      channel: "line",
      isResend: true,
      deliverySuppressed: true,
      hasRecruitmentTarget: true,
      hasStaffTarget: true,
    });
    expect(changedProbe.failureInbox).toHaveLength(0);
    await assertNoNotificationOutbox({
      shopId: seed.shopId,
      recruitmentId: seed.recruitmentId,
      staffEmail: e2eClerkUser,
      notificationContext: "notification.sendConfirmationEmail",
      channel: "email",
    });

    const firstToken = await waitForMagicLinkToken({
      recruitmentId: seed.recruitmentId,
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "view",
    });
    await staffView.goto(firstToken.token);
    await staffView.expectShiftViewVisible();

    const isolated = await browser.newContext({ baseURL: "http://localhost:3000" });
    const isolatedPage = await isolated.newPage();
    const isolatedView = new StaffViewPage(isolatedPage);
    try {
      await isolatedView.goto(firstToken.token);
      await isolatedView.expectExpiredVisible();
      await isolatedView.requestReissue(e2eClerkUser);

      const reissueProbe = await waitForNotificationOutbox({
        shopId: seed.shopId,
        staffEmail: e2eClerkUser,
        notificationContext: "notification.sendReissueEmail",
        channel: "line",
      });
      expect(reissueProbe.outbox[0]).toMatchObject({
        channel: "line",
        notificationContext: "notification.sendReissueEmail",
        deliverySuppressed: true,
        hasStaffTarget: true,
      });
      expect(reissueProbe.failureInbox).toHaveLength(0);
      await assertNoNotificationOutbox({
        shopId: seed.shopId,
        staffEmail: e2eClerkUser,
        notificationContext: "notification.sendReissueEmail",
        channel: "email",
      });
      const reissuedToken = await waitForFreshMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: e2eClerkUser,
        purpose: "view",
        previousToken: firstToken.token,
      });
      expect(reissuedToken.token).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await isolated.close();
    }
  });
});
