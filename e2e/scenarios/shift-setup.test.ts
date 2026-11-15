import { test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { ShiftFormCells } from "../pages/ShiftFormCells";
import { ShiftSetupPage } from "../pages/ShiftSetupPage";

type OpenRecruitmentSeed = {
  organizationId: string;
  recruitmentId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "追加通知テスト店舗";
const STAFF_NAME = "田中太郎";
const NEW_POSITION_NAME = "キッチン";

test.describe("シフト作成の設定", { tag: ["@e2e-core"] }, () => {
  // 設定ページの保存、シフト表の読み込み、下書き保存と再読込を含む。近い契約の実測へ余裕を加えた失敗上限。
  test.setTimeout(90_000);

  test("[E2E-STAFFING-01] 設定ページで足したポジションをシフト表で選んで勤務を入れ、再読込後もそのポジションで表示される", async ({
    page,
  }) => {
    const dates = getNextWeekDates();
    const firstDate = formatDateWithWeekday(dates.dates[0]);
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      dateOnly: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);

    await test.step("設定ページでポジションを足して保存する", async () => {
      const setupPage = new ShiftSetupPage(page);
      await setupPage.goto(seed.organizationId, seed.shopId);
      await setupPage.addPosition(NEW_POSITION_NAME);
    });

    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const cells = new ShiftFormCells(page);

    await test.step("シフト表で足したポジションを選び、勤務を入れて下書きを保存する", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.openRecruitment({ ...dates, shopName: SCENARIO_SHOP_NAME });
      await cells.selectPositionTool(NEW_POSITION_NAME);
      await cells.assignDateOnlyWithPosition(STAFF_NAME, firstDate, NEW_POSITION_NAME);
      await shiftBoard.saveDraft();
    });

    await test.step("再読込しても、入れた勤務が足したポジションで表示される", async () => {
      await page.reload();
      await cells.expectDateOnlyPosition(STAFF_NAME, firstDate, NEW_POSITION_NAME);
    });
  });
});
