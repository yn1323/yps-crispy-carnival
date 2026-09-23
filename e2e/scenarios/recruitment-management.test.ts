import { test } from "../fixtures/e2eTest";
import { withAnonymousStaffPage } from "../helpers/anonymousStaffPage";
import { expectAppHydrated } from "../helpers/appReadiness";
import { addDaysToCalendarDate, formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { createMagicLinkTokenForLatestRecruitment } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

type RecruitmentManagementSeed = {
  organizationId: string;
  shopId: string;
  recruitmentId: string;
  otherRecruitmentId: string;
};

const SCENARIO_SHOP_NAME = "募集管理テスト店舗";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

// bearer capabilityを開くため、URLを保持し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("シフト募集の編集と削除", { tag: ["@e2e-core", "@capability"] }, () => {
  // 編集Dialog、削除確認、再読込、2つの匿名提出画面を含む。3-worker実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(90_000);

  test("[E2E-RECRUITMENT-01] 募集の期間と提出期限を編集し、別の募集を削除すると提出画面へ反映される", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const otherDates = getNextWeekDates(Date.now() + ONE_WEEK_MS);
    const seed = seedManagerScenario<RecruitmentManagementSeed>("testing:seedRecruitmentManagementScenario", {
      dates,
      otherDates,
    });
    assertNotificationDeliverySuppressed(seed.shopId);
    const editedCapability = createMagicLinkTokenForLatestRecruitment({
      recruitmentId: seed.recruitmentId,
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });
    const deletedCapability = createMagicLinkTokenForLatestRecruitment({
      recruitmentId: seed.otherRecruitmentId,
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });
    const recruitment = { ...dates, shopName: SCENARIO_SHOP_NAME };
    const otherRecruitment = { ...otherDates, shopName: SCENARIO_SHOP_NAME };
    // 月曜〜金曜へ短縮し、提出期限を1日早める。
    const editedSchedule = {
      periodStart: dates.dates[0],
      periodEnd: dates.dates[4],
      deadline: addDaysToCalendarDate(dates.deadline, -1),
    };
    const appShifts = new AppShiftsPage(page);

    await test.step("管理者が募集の期間と提出期限を編集し、別の募集を削除する", async () => {
      await appShifts.goto(seed.organizationId);
      await appShifts.editRecruitmentSchedule(recruitment, editedSchedule);
      await appShifts.deleteRecruitment(otherRecruitment);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectAppHydrated(page);
      await appShifts.expectRecruitmentVisible({ ...editedSchedule, shopName: SCENARIO_SHOP_NAME });
      await appShifts.expectRecruitmentAbsent(otherRecruitment);
    });

    await test.step("匿名スタッフの提出画面に編集後の条件と削除済みの案内が表示される", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-recruitment-management",
        action: async (anonymousPage) => {
          const submitPage = new StaffSubmitPage(anonymousPage);
          await submitPage.goto(editedCapability.token);
          await submitPage.expectFormVisible();
          await submitPage.expectSchedule(
            formatDateWithWeekday(editedSchedule.deadline),
            formatDateWithWeekday(dates.dates[4]),
            formatDateWithWeekday(dates.dates[5]),
          );

          await submitPage.goto(deletedCapability.token);
          await submitPage.expectRecruitmentDeleted();
        },
      });
    });
  });
});
