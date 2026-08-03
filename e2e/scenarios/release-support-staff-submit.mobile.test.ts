import { test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { createMagicLinkTokenForLatestRecruitment } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

type MobileScenarioSeed = {
  recruitmentId: string;
  shopId: string;
};

// bearer capabilityを開くため、URLを保持し得るartifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("スタッフ提出のモバイル境界", { tag: ["@e2e-core", "@capability"] }, () => {
  test("[E2E-MOBILE-01] Mobile Chromeで代表日を選び提出を完了する", async ({ e2eClerkUser, page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<MobileScenarioSeed>("testing:seedOpenRecruitmentNotificationScenario", { dates });
    const capability = createMagicLinkTokenForLatestRecruitment({
      recruitmentId: seed.recruitmentId,
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });
    const submitPage = new StaffSubmitPage(page);

    await submitPage.goto(capability.token);
    await submitPage.expectFormVisible();
    await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
    await submitPage.submit();
    await submitPage.expectCompletionVisible();
  });
});
