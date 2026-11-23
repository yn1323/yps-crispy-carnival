import { test } from "../fixtures/e2eTest";
import { getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { ShiftSetupPage } from "../pages/ShiftSetupPage";

type OpenRecruitmentSeed = {
  organizationId: string;
  recruitmentId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "追加通知テスト店舗";
const POSITION_NAME = "キッチン";
const REQUIRED_COUNT = 1;

// スタッフの氏名を表示するため、画面状態を保存し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("シフトの自動作成", { tag: ["@e2e-core"] }, () => {
  // 設定ページの保存、シフト表の読み込み、自動作成、下書き保存と再読込を含む。近い契約の実測へ余裕を加えた失敗上限。
  test.setTimeout(90_000);

  test("[E2E-AUTOCREATE-01] 設定ページで入れた必要人数と提出済みの希望から勤務を自動で作り、下書き保存と再読込のあとも残る", async ({
    page,
  }) => {
    const dates = getNextWeekDates();
    const empty = `0/${REQUIRED_COUNT}`;
    const filled = `${REQUIRED_COUNT}/${REQUIRED_COUNT}`;
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      dateOnly: true,
      shopDateOnly: true,
      managerStaffSubmittedDates: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);

    await test.step("設定ページでポジションとテンプレートの必要人数を入れ、まとめて保存する", async () => {
      const setupPage = new ShiftSetupPage(page);
      await setupPage.goto(seed.organizationId, seed.shopId);
      await setupPage.addPositionDraft(POSITION_NAME);
      await setupPage.createFirstDateOnlyTemplate([{ positionName: POSITION_NAME, count: REQUIRED_COUNT }]);
      await setupPage.save();
    });

    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);

    await test.step("シフト表を開くと、どの日にも勤務がなく、必要人数に届いていない", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.openRecruitment({ ...dates, shopName: SCENARIO_SHOP_NAME });
      await shiftBoard.expectStaffingCountDays(POSITION_NAME, empty, dates.dates.length);
    });

    await test.step("希望シフトから自動で作ると、希望を出した全日に勤務が入り、下書きを保存できる", async () => {
      await shiftBoard.autoCreateFromRequests();
      await shiftBoard.expectStaffingCountDays(POSITION_NAME, filled, dates.dates.length);
      await shiftBoard.expectStaffingCountDays(POSITION_NAME, empty, 0);
      await shiftBoard.saveDraft();
    });

    await test.step("再読込しても、自動で作った勤務が残る", async () => {
      await page.reload();
      await shiftBoard.expectStaffingCountDays(POSITION_NAME, filled, dates.dates.length);
      await shiftBoard.expectStaffingCountDays(POSITION_NAME, empty, 0);
    });
  });
});
