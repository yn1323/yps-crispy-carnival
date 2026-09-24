import { test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftFormCells } from "../pages/ShiftFormCells";
import { UserShopDetailPage } from "../pages/UserShopDetailPage";

type ShiftExclusionSeed = {
  organizationId: string;
  shopId: string;
  recruitmentId: string;
  staffPersonId: string;
  staffName: string;
};

const SCENARIO_SHOP_NAME = "対象外テスト店舗";
const MANAGER_STAFF_NAME = "田中太郎";

// スタッフの氏名を表示するため、画面状態を保存し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("シフト対象外スタッフ", { tag: ["@e2e-core"] }, () => {
  // スタッフ設定とシフト表を2往復する。3-worker実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(90_000);

  test("[E2E-EXCLUSION-01] スタッフをシフト対象外にするとシフト表と提出人数から外れ、戻すと再表示される", async ({
    page,
  }) => {
    const dates = getNextWeekDates();
    const firstDateLabel = formatDateWithWeekday(dates.dates[0]);
    const seed = seedManagerScenario<ShiftExclusionSeed>("testing:seedShiftExclusionScenario", { dates });
    assertNotificationDeliverySuppressed(seed.shopId);
    const appShifts = new AppShiftsPage(page);
    const boardCells = new ShiftFormCells(page);
    const userShop = new UserShopDetailPage(page);
    const recruitment = { ...dates, shopName: SCENARIO_SHOP_NAME };

    const openBoard = async (totalStaffCount: number) => {
      await appShifts.goto(seed.organizationId);
      await appShifts.expectSubmissionCount(recruitment, 0, totalStaffCount);
      await appShifts.openRecruitment(recruitment);
      await boardCells.expectDateOnlyAssignment(MANAGER_STAFF_NAME, firstDateLabel, false);
    };

    await test.step("対象スタッフがシフト表と提出人数に含まれている", async () => {
      await openBoard(2);
      await boardCells.expectDateOnlyAssignment(seed.staffName, firstDateLabel, false);
    });

    await test.step("スタッフの店舗別設定でシフト対象外にすると、シフト表と提出人数から外れる", async () => {
      await userShop.goto(seed.organizationId, seed.staffPersonId, seed.shopId);
      await userShop.setShiftTarget(false);
      await openBoard(1);
      await boardCells.expectDateOnlyStaffAbsent(seed.staffName, firstDateLabel);
    });

    await test.step("シフト対象に戻すと、シフト表と提出人数へ再び含まれる", async () => {
      await userShop.goto(seed.organizationId, seed.staffPersonId, seed.shopId);
      await userShop.setShiftTarget(true);
      await openBoard(2);
      await boardCells.expectDateOnlyAssignment(seed.staffName, firstDateLabel, false);
    });
  });
});
