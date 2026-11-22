import { test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { ShiftFormCells } from "../pages/ShiftFormCells";

type TwoRecruitmentsSeed = {
  organizationId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "募集管理テスト店舗";
const STAFF_NAME = "田中太郎";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

// スタッフの氏名を表示するため、画面状態を保存し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("未提出者の仮の勤務", { tag: ["@e2e-core"] }, () => {
  // 2つの募集のシフト表、確定Dialog、下書き保存、再読込を含む。近い契約の実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(90_000);

  test("[E2E-PROVISIONAL-01] 前回確定した募集の勤務を、次の募集の未提出者へ同じ曜日の仮の勤務として入れ、再読込後も仮で表示される", async ({
    page,
  }) => {
    const previousDates = getNextWeekDates();
    const nextDates = getNextWeekDates(Date.now() + ONE_WEEK_MS);
    const previousMonday = formatDateWithWeekday(previousDates.dates[0]);
    const nextMonday = formatDateWithWeekday(nextDates.dates[0]);
    const nextTuesday = formatDateWithWeekday(nextDates.dates[1]);
    const seed = seedManagerScenario<TwoRecruitmentsSeed>("testing:seedRecruitmentManagementScenario", {
      dates: previousDates,
      otherDates: nextDates,
      dateOnly: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);
    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const cells = new ShiftFormCells(page);

    await test.step("管理者が先の週の募集で月曜に勤務を入れて確定する", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.openRecruitment({ ...previousDates, shopName: SCENARIO_SHOP_NAME });
      await cells.toggleDateOnlyAssignment(STAFF_NAME, previousMonday, false);
      await shiftBoard.confirm(1);
      await shiftBoard.expectConfirmedStatus();
    });

    await test.step("次の週の募集をくわしく表示にし、前回の勤務を仮で入れて下書きを保存する", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.openRecruitment({ ...nextDates, shopName: SCENARIO_SHOP_NAME });
      await shiftBoard.switchToDetailMode();
      await shiftBoard.insertPreviousShiftsAsProvisional(1);
      await cells.expectDateOnlyProvisional(STAFF_NAME, nextMonday);
      await cells.expectDateOnlyAssignment(STAFF_NAME, nextTuesday, false);
      await shiftBoard.saveDraft();
    });

    await test.step("再読込しても、同じ曜日の勤務が仮で表示される", async () => {
      await page.reload();
      await cells.expectDateOnlyProvisional(STAFF_NAME, nextMonday);
      await cells.expectDateOnlyAssignment(STAFF_NAME, nextTuesday, false);
    });
  });
});
