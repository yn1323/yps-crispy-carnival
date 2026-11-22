import { test } from "../fixtures/e2eTest";
import { withAnonymousStaffPage } from "../helpers/anonymousStaffPage";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { ShiftFormCells } from "../pages/ShiftFormCells";
import { ShiftSetupPage } from "../pages/ShiftSetupPage";
import { StaffViewPage } from "../pages/StaffViewPage";

type OpenRecruitmentSeed = {
  organizationId: string;
  recruitmentId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "追加通知テスト店舗";
const STAFF_NAME = "田中太郎";
const NEW_POSITION_NAME = "キッチン";

// bearer capabilityを開くため、URLを保持し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("ポジションを分けたシフトの確定と閲覧", { tag: ["@e2e-core", "@capability"] }, () => {
  // 設定ページの保存、シフト表の割当、確定、匿名閲覧の4境界を含む。近い契約の実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(120_000);

  test("[E2E-STAFFING-03] 設定ページで足したポジションで入れた勤務を確定すると、スタッフ向けの確定シフトにそのポジションで表示される", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
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

    await test.step("シフト表で足したポジションの勤務を入れて確定する", async () => {
      const appShifts = new AppShiftsPage(page);
      const shiftBoard = new ShiftBoardPage(page);
      const cells = new ShiftFormCells(page);
      await appShifts.goto(seed.organizationId);
      await appShifts.openRecruitment({ ...dates, shopName: SCENARIO_SHOP_NAME });
      await cells.assignDateOnlyWithPosition(STAFF_NAME, firstDate, NEW_POSITION_NAME);
      await shiftBoard.confirm(1);
      await shiftBoard.expectConfirmedStatus();
    });

    const viewCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "view",
    });

    await test.step("別の匿名contextで、確定した勤務が足したポジションで表示される", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-position-view",
        action: async (anonymousPage) => {
          const viewPage = new StaffViewPage(anonymousPage);
          const viewCells = new ShiftFormCells(anonymousPage);
          await viewPage.goto(viewCapability.token);
          await viewPage.expectShiftViewVisible();
          await viewCells.expectDateOnlyPosition(STAFF_NAME, firstDate, NEW_POSITION_NAME);
        },
      });
    });
  });
});
