import { test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { runWithE2ERuntimeSignalMonitoring } from "../helpers/runtimeSignals";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";
import { StaffViewPage } from "../pages/StaffViewPage";

type ShiftScenarioSeed = {
  shopId: string;
};

const SCENARIO_SHOP_NAME = "通知募集テスト店舗";

// bearer capabilityを開くため、URLを保持し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("代表シフト導線", { tag: ["@e2e-core", "@capability"] }, () => {
  // 4つのbrowser境界と5回のfail-closed CLI確認を含む契約。3-worker burn-inの実測へ
  // cleanup余裕を加えた失敗上限であり、成功時に消費する固定待機ではない。
  test.setTimeout(90_000);

  test("[E2E-SHIFT-01] 全店舗シフト画面の募集からスタッフ提出・確定・閲覧まで接続する", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ShiftScenarioSeed>("testing:seedNotificationSubmitScenario", { dates });
    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    assertNotificationDeliverySuppressed(seed.shopId);

    await test.step("管理者が全店舗のシフト画面から対象店舗を選んで募集を開始する", async () => {
      await appShifts.goto();
      await appShifts.expectDefaultAllFilter();
      await appShifts.createRecruitment({ ...dates, shopName: SCENARIO_SHOP_NAME });
    });

    const submitCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });

    await test.step("匿名スタッフが代表日を提出する", async () => {
      const context = await browser.newContext({ baseURL, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
      const anonymousPage = await context.newPage();
      const submitPage = new StaffSubmitPage(anonymousPage);
      await runWithE2ERuntimeSignalMonitoring({
        page: anonymousPage,
        testInfo,
        baseURL,
        attachmentName: "e2e-safe-browser-signals-anonymous-submit",
        action: async () => {
          await submitPage.goto(submitCapability.token);
          await submitPage.expectFormVisible();
          await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
          await submitPage.submit();
          await submitPage.expectCompletionVisible();
          await submitPage.expectCompletionPersistsAcrossReloadAndHistory();
        },
        cleanup: () => context.close(),
      });
    });

    await test.step("管理者が店舗名付きカードからシフト表を開いて確定する", async () => {
      await appShifts.openRecruitment({ ...dates, shopName: SCENARIO_SHOP_NAME });
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
      const anonymousPage = await context.newPage();
      const viewPage = new StaffViewPage(anonymousPage);
      await runWithE2ERuntimeSignalMonitoring({
        page: anonymousPage,
        testInfo,
        baseURL,
        attachmentName: "e2e-safe-browser-signals-anonymous-view",
        action: async () => {
          await viewPage.goto(viewCapability.token);
          await viewPage.expectShiftViewVisible();
          await viewPage.expectStaffVisible("田中太郎");
          await viewPage.expectShiftTimeVisible();
        },
        cleanup: () => context.close(),
      });
    });
  });
});
