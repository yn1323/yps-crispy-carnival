import { test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";
import { StaffViewPage } from "../pages/StaffViewPage";

type ShiftScenarioSeed = {
  shopId: string;
};

// bearer capabilityを開くため、URLを保持し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("代表シフト導線", { tag: ["@e2e-core", "@capability"] }, () => {
  // 4つのbrowser境界と5回のfail-closed CLI確認を含む契約。3-worker burn-inの実測へ
  // cleanup余裕を加えた失敗上限であり、成功時に消費する固定待機ではない。
  test.setTimeout(90_000);

  test("[E2E-SHIFT-01] 管理者の募集からスタッフ提出・確定・閲覧まで接続する", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ShiftScenarioSeed>("testing:seedNotificationSubmitScenario", { dates });
    const dashboard = new DashboardPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    assertNotificationDeliverySuppressed(seed.shopId);

    await test.step("管理者が募集を開始する", async () => {
      await dashboard.goto(seed.shopId);
      await dashboard.createRecruitment(dates);
    });

    const submitCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });

    await test.step("匿名スタッフが代表日を提出する", async () => {
      const context = await browser.newContext({ baseURL, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
      const submitPage = new StaffSubmitPage(await context.newPage());
      try {
        await submitPage.goto(submitCapability.token);
        await submitPage.expectFormVisible();
        await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
        await submitPage.submit();
        await submitPage.expectCompletionVisible();
      } finally {
        await context.close();
      }
    });

    await test.step("管理者が提出を確認してシフトを確定する", async () => {
      await dashboard.goto(seed.shopId);
      await dashboard.openShiftBoard();
      await shiftBoard.expectOverviewStaffTimeCount("田中太郎", 1);
      await shiftBoard.confirm(1);
      await shiftBoard.expectConfirmedStatus();
    });

    const viewCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "view",
    });

    await test.step("匿名スタッフが確定シフトを閲覧する", async () => {
      const context = await browser.newContext({ baseURL, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
      const viewPage = new StaffViewPage(await context.newPage());
      try {
        await viewPage.goto(viewCapability.token);
        await viewPage.expectShiftViewVisible();
        await viewPage.expectStaffVisible("田中太郎");
        await viewPage.expectShiftTimeVisible();
      } finally {
        await context.close();
      }
    });
  });
});
