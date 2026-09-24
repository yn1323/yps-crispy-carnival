import { expect, test } from "../fixtures/e2eTest";
import { withAnonymousStaffPage } from "../helpers/anonymousStaffPage";
import { expectAppHydrated } from "../helpers/appReadiness";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { createMagicLinkTokenForLatestRecruitment, waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { ShiftBoardPage } from "../pages/ShiftBoardPage";
import { ShiftFormCells } from "../pages/ShiftFormCells";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";
import { StaffViewPage } from "../pages/StaffViewPage";

type OpenRecruitmentSeed = {
  organizationId: string;
  recruitmentId: string;
  shopId: string;
};

const SCENARIO_SHOP_NAME = "追加通知テスト店舗";
const STAFF_NAME = "田中太郎";

// bearer capabilityを開くため、URLを保持し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("提出後と確定後のシフト修正", { tag: ["@e2e-core", "@capability"] }, () => {
  // 匿名提出の往復、シフト表の再読込、確定と再通知を含む。3-worker実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(90_000);

  test("[E2E-SHIFT-04] 同じ提出リンクで希望を追加・取り消して再提出し、シフト表へ反映する", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const [firstDate, secondDate, thirdDate] = dates.dates.map(formatDateWithWeekday);
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      dateOnly: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);
    const submitCapability = createMagicLinkTokenForLatestRecruitment({
      recruitmentId: seed.recruitmentId,
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });
    const recruitment = { ...dates, shopName: SCENARIO_SHOP_NAME };

    await test.step("匿名スタッフが2日を提出し、同じリンクで1日を取り消して別の1日を追加する", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-resubmit",
        action: async (anonymousPage) => {
          const submitPage = new StaffSubmitPage(anonymousPage);
          await submitPage.goto(submitCapability.token);
          await submitPage.expectFormVisible();
          await submitPage.toggleDay(firstDate);
          await submitPage.toggleDay(secondDate);
          await submitPage.submit();
          await submitPage.expectCompletionVisible();

          await submitPage.goto(submitCapability.token);
          await submitPage.toggleDay(firstDate);
          await submitPage.toggleDay(thirdDate);
          await submitPage.resubmit();
          await submitPage.expectCompletionVisible();
        },
      });
    });

    await test.step("管理者のシフト表に再提出後の希望だけが反映される", async () => {
      const appShifts = new AppShiftsPage(page);
      const boardCells = new ShiftFormCells(page);
      await appShifts.goto(seed.organizationId);
      await appShifts.expectSubmissionCount(recruitment, 1, 1);
      await appShifts.openRecruitment(recruitment);
      await boardCells.expectDateOnlyAssignment(STAFF_NAME, firstDate, false);
      await boardCells.expectDateOnlyAssignment(STAFF_NAME, secondDate, true);
      await boardCells.expectDateOnlyAssignment(STAFF_NAME, thirdDate, true);
    });
  });

  test("[E2E-SHIFT-05] 下書きを再読込後も保持し、確定後に割当を変えて再通知した内容を閲覧できる", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const [firstDate, secondDate] = dates.dates.map(formatDateWithWeekday);
    const seed = seedManagerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", {
      dates,
      dateOnly: true,
    });
    assertNotificationDeliverySuppressed(seed.shopId);
    const appShifts = new AppShiftsPage(page);
    const shiftBoard = new ShiftBoardPage(page);
    const boardCells = new ShiftFormCells(page);
    const recruitment = { ...dates, shopName: SCENARIO_SHOP_NAME };

    await test.step("管理者が2日を割り当てて下書き保存し、再読込後も保持される", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.openRecruitment(recruitment);
      await boardCells.toggleDateOnlyAssignment(STAFF_NAME, firstDate, false);
      await boardCells.toggleDateOnlyAssignment(STAFF_NAME, secondDate, false);
      await shiftBoard.saveDraft();
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectAppHydrated(page);
      await boardCells.expectDateOnlyAssignment(STAFF_NAME, firstDate, true);
      await boardCells.expectDateOnlyAssignment(STAFF_NAME, secondDate, true);
    });

    await test.step("確定後に1日を外し、変更があるスタッフへ再通知する", async () => {
      await shiftBoard.confirm(1);
      await shiftBoard.expectConfirmedStatus();
      await boardCells.toggleDateOnlyAssignment(STAFF_NAME, secondDate, true);
      await shiftBoard.notifyChangedStaff();
      await expect(page.getByRole("button", { name: "もう一度通知", exact: true })).toBeVisible();
    });

    const viewCapability = await waitForMagicLinkToken({
      recruitmentId: seed.recruitmentId,
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "view",
    });

    await test.step("匿名スタッフが再通知後の割当を閲覧する", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-reconfirmed-view",
        action: async (anonymousPage) => {
          const viewPage = new StaffViewPage(anonymousPage);
          const viewCells = new ShiftFormCells(anonymousPage);
          await viewPage.goto(viewCapability.token);
          await viewPage.expectShiftViewVisible();
          await viewCells.expectDateOnlyAssignment(STAFF_NAME, firstDate, true);
          await viewCells.expectDateOnlyAssignment(STAFF_NAME, secondDate, false);
        },
      });
    });
  });
});
