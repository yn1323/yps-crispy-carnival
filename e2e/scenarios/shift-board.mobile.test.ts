import { devices } from "@playwright/test";
import { expect, test } from "../fixtures/e2eTest";
import { withAnonymousStaffPage } from "../helpers/anonymousStaffPage";
import { expectAppHydrated } from "../helpers/appReadiness";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { ShiftFormCells } from "../pages/ShiftFormCells";
import { StaffViewPage } from "../pages/StaffViewPage";

type OpenRecruitmentSeed = {
  organizationId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "追加通知テスト店舗";
const STAFF_NAME = "田中太郎";
const WORK_TIME = { start: "10:00", end: "15:00" };
// 「休憩を追加」は、勤務時間の中央に1時間の休憩を入れる。
const BREAK_LABEL = "12:00〜13:00";

// スタッフの氏名を表示し、bearer capabilityも開くため、画面状態やURLを保存し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("スマートフォンのシフト表", { tag: ["@e2e-core"] }, () => {
  // 一覧、日別シフト表、確定Dialog、再読込を含む。mobile projectの実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(60_000);

  test("[E2E-MOBILE-02] Mobile Chromeの日別シフト表で割り当てて確定し、再読込後も保持される", async ({ page }) => {
    const dates = getNextWeekDates();
    const [firstDate, secondDate] = dates.dates;
    const secondDateLabel = formatDateWithWeekday(secondDate);
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      dateOnly: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);
    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const cells = new ShiftFormCells(page);
    const recruitment = { ...dates, shopName: SCENARIO_SHOP_NAME };

    await test.step("管理者がスマートフォンの日別シフト表で2日目に割り当てて確定する", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.expectRecruitmentVisible(recruitment);
      await appShifts.openRecruitmentCardByPeriod(recruitment);
      await cells.expectDateOnlyAssignment(STAFF_NAME, formatDateWithWeekday(firstDate), false);
      await page.getByRole("button", { name: `${secondDateLabel}を表示`, exact: true }).click();
      await cells.toggleDateOnlyAssignment(STAFF_NAME, secondDateLabel, false);
      await shiftBoard.confirmFromMobileMenu(1);
    });

    await test.step("再読込後も確定した割当が表示される", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectAppHydrated(page);
      await page.getByRole("button", { name: `${secondDateLabel}を表示`, exact: true }).click();
      await cells.expectDateOnlyAssignment(STAFF_NAME, secondDateLabel, true);
      await expect(page.getByRole("button", { name: "保存・変更を通知・出力", exact: true })).toBeVisible();
    });
  });
});

test.describe("スマートフォンのシフト表の休憩", { tag: ["@e2e-core", "@capability"] }, () => {
  // 日別シフト表、編集シート、確定Dialog、匿名閲覧を含む。mobile projectの実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(90_000);

  test("[E2E-MOBILE-03] Mobile Chromeの時間指定のシフト表で勤務と休憩を入れて確定すると、スタッフ向けの確定シフトに休憩が表示される", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      shopDetailMode: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);
    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const recruitment = { ...dates, shopName: SCENARIO_SHOP_NAME };

    await test.step("管理者がくわしく表示の編集シートで勤務と休憩を入れて確定する", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.expectRecruitmentVisible(recruitment);
      await appShifts.openRecruitmentCardByPeriod(recruitment);
      await shiftBoard.addMobileWorkWithBreak(STAFF_NAME, WORK_TIME);
      await shiftBoard.expectMobileBreak(STAFF_NAME, BREAK_LABEL);
      await shiftBoard.confirmFromMobileMenu(1);
    });

    const viewCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "view",
    });

    await test.step("別の匿名contextで、確定した勤務の休憩が表示される", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-mobile-break-view",
        contextOptions: devices["Pixel 7"],
        action: async (anonymousPage) => {
          const viewPage = new StaffViewPage(anonymousPage);
          await viewPage.goto(viewCapability.token);
          await viewPage.expectShiftViewVisible();
          await viewPage.expectStaffBreakVisible(STAFF_NAME, BREAK_LABEL);
        },
      });
    });
  });
});
