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
const REQUIRED_KITCHEN_COUNT = 2;

test.describe("必要人数設定", { tag: ["@e2e-core"] }, () => {
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
      await cells.assignDateOnlyWithPosition(STAFF_NAME, firstDate, NEW_POSITION_NAME);
      await shiftBoard.saveDraft();
    });

    await test.step("再読込しても、入れた勤務が足したポジションで表示される", async () => {
      await page.reload();
      await cells.expectDateOnlyPosition(STAFF_NAME, firstDate, NEW_POSITION_NAME);
    });
  });

  test("[E2E-STAFFING-02] 設定ページで保存したテンプレートの必要人数が、シフト表の日付の見出しに「配置/必要」で出て、割り当てた日だけ配置が増える", async ({
    page,
  }) => {
    const dates = getNextWeekDates();
    const firstDate = formatDateWithWeekday(dates.dates[0]);
    const required = `0/${REQUIRED_KITCHEN_COUNT}`;
    const placed = `1/${REQUIRED_KITCHEN_COUNT}`;
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      dateOnly: true,
      shopDateOnly: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);

    await test.step("設定ページでポジションとテンプレートの必要人数を入れ、まとめて保存する", async () => {
      const setupPage = new ShiftSetupPage(page);
      await setupPage.goto(seed.organizationId, seed.shopId);
      await setupPage.addPositionDraft(NEW_POSITION_NAME);
      await setupPage.createFirstDateOnlyTemplate([{ positionName: NEW_POSITION_NAME, count: REQUIRED_KITCHEN_COUNT }]);
      await setupPage.save();
    });

    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const cells = new ShiftFormCells(page);

    await test.step("シフト表の日付の見出しに、テンプレートの必要人数が出る", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.openRecruitment({ ...dates, shopName: SCENARIO_SHOP_NAME });
      // 最初のテンプレートは、すべての営業日に使う。
      await shiftBoard.expectStaffingCountDays(NEW_POSITION_NAME, required, dates.dates.length);
      await shiftBoard.expectStaffingCountDays(NEW_POSITION_NAME, placed, 0);
    });

    await test.step("足したポジションで勤務を入れると、その日だけ配置が増える", async () => {
      await cells.assignDateOnlyWithPosition(STAFF_NAME, firstDate, NEW_POSITION_NAME);
      await shiftBoard.expectStaffingCountDays(NEW_POSITION_NAME, placed, 1);
      await shiftBoard.expectStaffingCountDays(NEW_POSITION_NAME, required, dates.dates.length - 1);
    });
  });

  test("[E2E-STAFFING-04] 設定ページで担当外にしたポジションへ勤務を入れると、シフト表が確認事項で知らせる", async ({
    page,
  }) => {
    const dates = getNextWeekDates();
    const firstDate = formatDateWithWeekday(dates.dates[0]);
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      dateOnly: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);

    await test.step("設定ページでポジションを足し、スタッフをそのポジションの担当外にして保存する", async () => {
      const setupPage = new ShiftSetupPage(page);
      await setupPage.goto(seed.organizationId, seed.shopId);
      await setupPage.addPositionDraft(NEW_POSITION_NAME);
      await setupPage.markStaffPositionUnavailable(STAFF_NAME, NEW_POSITION_NAME);
      await setupPage.save();
    });

    await test.step("シフト表で担当外のポジションへ勤務を入れると、セルが確認事項の理由を持つ", async () => {
      const appShifts = new AppShiftsPage(page);
      const cells = new ShiftFormCells(page);
      await appShifts.goto(seed.organizationId);
      await appShifts.openRecruitment({ ...dates, shopName: SCENARIO_SHOP_NAME });
      await cells.assignDateOnlyWithPosition(STAFF_NAME, firstDate, NEW_POSITION_NAME);
      await cells.expectDateOnlyPositionNotice(STAFF_NAME, firstDate, NEW_POSITION_NAME, "担当外のポジション");
    });
  });
});
