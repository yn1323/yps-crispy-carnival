import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { ShiftFormCells } from "../pages/ShiftFormCells";

type OpenRecruitmentSeed = {
  organizationId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "追加通知テスト店舗";
const STAFF_NAME = "田中太郎";

// スタッフの氏名を表示するため、画面状態を保存し得るartifactを作らない。
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
      await expect(page.getByRole("button", { name: "保存・再送・出力", exact: true })).toBeVisible();
    });
  });
});
