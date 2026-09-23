import { test } from "../fixtures/e2eTest";
import { withAnonymousStaffPage } from "../helpers/anonymousStaffPage";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { ShiftFormCells } from "../pages/ShiftFormCells";
import { ShopLifecyclePage } from "../pages/ShopLifecyclePage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";
import { StaffViewPage } from "../pages/StaffViewPage";

type ShiftMethodScenarioSeed = {
  organizationId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "通知募集テスト店舗";
const STAFF_NAME = "田中太郎";
const CUSTOM_PATTERN_NAME = "E2E朝番";
const DEFAULT_SECOND_PATTERN_NAME = "遅番";

// bearer capabilityを開くため、URLを保持し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("提出方法ごとのシフト導線", { tag: ["@e2e-core", "@capability"] }, () => {
  // 店舗設定、募集、匿名提出、割当、確定、匿名閲覧の6境界を含む。3-worker実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(120_000);

  test("[E2E-SHIFT-02] 店舗設定で日付選択に変え、提出した出勤日を割当・確定して閲覧できる", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const [firstDate, secondDate] = dates.dates;
    const firstDateLabel = formatDateWithWeekday(firstDate);
    const secondDateLabel = formatDateWithWeekday(secondDate);
    const seed = seedManagerScenario<ShiftMethodScenarioSeed>("testing:seedNotificationSubmitScenario", { dates });
    assertNotificationDeliverySuppressed(seed.shopId);
    const shop = new ShopLifecyclePage(page);
    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const boardCells = new ShiftFormCells(page);
    const recruitment = { ...dates, shopName: SCENARIO_SHOP_NAME };

    await test.step("管理者が店舗設定で提出方法を日付選択へ変え、募集を作る", async () => {
      await shop.gotoShopDetail(seed.organizationId, seed.shopId, SCENARIO_SHOP_NAME);
      await shop.changeSubmissionMethodToDateOnly();
      await appShifts.goto(seed.organizationId);
      await appShifts.createRecruitment(recruitment);
    });

    const submitCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });

    await test.step("匿名スタッフが日付選択の画面で2日を提出する", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-date-only-submit",
        action: async (anonymousPage) => {
          const submitPage = new StaffSubmitPage(anonymousPage);
          await submitPage.goto(submitCapability.token);
          await submitPage.expectFormVisible();
          await submitPage.toggleDay(firstDateLabel);
          await submitPage.toggleDay(secondDateLabel);
          await submitPage.submit();
          await submitPage.expectCompletionVisible();
        },
      });
    });

    await test.step("管理者が○×のシフト表で1日を外して確定する", async () => {
      await appShifts.expectSubmissionCount(recruitment, 1, 1);
      await appShifts.openRecruitment(recruitment);
      await boardCells.expectDateOnlyAssignment(STAFF_NAME, firstDateLabel, true);
      await boardCells.toggleDateOnlyAssignment(STAFF_NAME, secondDateLabel, true);
      await shiftBoard.confirm(1);
      await shiftBoard.expectConfirmedStatus();
    });

    const viewCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "view",
    });

    await test.step("別の匿名contextで、管理者が確定した出勤日だけを閲覧する", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-date-only-view",
        action: async (anonymousPage) => {
          const viewPage = new StaffViewPage(anonymousPage);
          const viewCells = new ShiftFormCells(anonymousPage);
          await viewPage.goto(viewCapability.token);
          await viewPage.expectShiftViewVisible();
          await viewCells.expectDateOnlyAssignment(STAFF_NAME, firstDateLabel, true);
          await viewCells.expectDateOnlyAssignment(STAFF_NAME, secondDateLabel, false);
        },
      });
    });
  });

  test("[E2E-SHIFT-03] 店舗設定で登録した勤務パターンを提出し、割当・確定して閲覧できる", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const [firstDate] = dates.dates;
    const firstDateLabel = formatDateWithWeekday(firstDate);
    const seed = seedManagerScenario<ShiftMethodScenarioSeed>("testing:seedNotificationSubmitScenario", { dates });
    assertNotificationDeliverySuppressed(seed.shopId);
    const shop = new ShopLifecyclePage(page);
    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const boardCells = new ShiftFormCells(page);
    const recruitment = { ...dates, shopName: SCENARIO_SHOP_NAME };

    await test.step("管理者が店舗設定で勤務パターンを登録し、募集を作る", async () => {
      await shop.gotoShopDetail(seed.organizationId, seed.shopId, SCENARIO_SHOP_NAME);
      await shop.changeSubmissionMethodToShiftType(CUSTOM_PATTERN_NAME);
      await appShifts.goto(seed.organizationId);
      await appShifts.createRecruitment(recruitment);
    });

    const submitCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });

    await test.step("匿名スタッフが登録済みの2パターンを同じ日に提出する", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-shift-type-submit",
        action: async (anonymousPage) => {
          const submitPage = new StaffSubmitPage(anonymousPage);
          await submitPage.goto(submitCapability.token);
          await submitPage.expectFormVisible();
          await submitPage.toggleDay(firstDateLabel);
          await submitPage.expectShiftTypeOptionSelected(firstDateLabel, CUSTOM_PATTERN_NAME, true);
          await submitPage.toggleShiftTypeOption(firstDateLabel, DEFAULT_SECOND_PATTERN_NAME, false);
          await submitPage.submit();
          await submitPage.expectCompletionVisible();
        },
      });
    });

    await test.step("管理者がパターン別のシフト表で1パターンを外して確定する", async () => {
      await appShifts.expectSubmissionCount(recruitment, 1, 1);
      await appShifts.openRecruitment(recruitment);
      await boardCells.selectDailyDate(firstDate);
      await boardCells.expectShiftTypeAssignment(STAFF_NAME, CUSTOM_PATTERN_NAME, true);
      await boardCells.toggleShiftTypeAssignment(STAFF_NAME, DEFAULT_SECOND_PATTERN_NAME, true);
      await shiftBoard.confirm(1);
      await shiftBoard.expectConfirmedStatus();
    });

    const viewCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "view",
    });

    await test.step("別の匿名contextで、確定した勤務パターンだけを閲覧する", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-shift-type-view",
        action: async (anonymousPage) => {
          const viewPage = new StaffViewPage(anonymousPage);
          const viewCells = new ShiftFormCells(anonymousPage);
          await viewPage.goto(viewCapability.token);
          await viewPage.expectShiftViewVisible();
          await viewCells.selectDailyDate(firstDate);
          await viewCells.expectShiftTypeAssignment(STAFF_NAME, CUSTOM_PATTERN_NAME, true);
          await viewCells.expectShiftTypeAssignment(STAFF_NAME, DEFAULT_SECOND_PATTERN_NAME, false);
        },
      });
    });
  });
});
