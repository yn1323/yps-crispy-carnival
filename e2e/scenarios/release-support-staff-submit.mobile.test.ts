import { test } from "../fixtures/e2eTest";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { createMagicLinkTokenForLatestRecruitment } from "../helpers/notificationTokens";
import { runWithE2ERuntimeSignalMonitoring } from "../helpers/runtimeSignals";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

type MobileScenarioSeed = {
  recruitmentId: string;
  shopId: string;
};

// bearer capabilityを開くため、URLを保持し得るartifactを作らない。
test.use({
  storageState: { cookies: [], origins: [] },
  trace: "off",
  screenshot: "off",
  video: "off",
});

test.describe("スタッフ提出のモバイル境界", { tag: ["@e2e-core", "@capability"] }, () => {
  // seed・capability発行・context lifecycleを含むため、既定30秒より余裕を持たせる。
  test.setTimeout(60_000);

  test("[E2E-MOBILE-01] Mobile Chromeで代表日を選び提出を完了する", async ({
    baseURL,
    context,
    e2eClerkUser,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<MobileScenarioSeed>("testing:seedOpenRecruitmentNotificationScenario", { dates });
    const capability = createMagicLinkTokenForLatestRecruitment({
      recruitmentId: seed.recruitmentId,
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });
    const page = await context.newPage();
    const submitPage = new StaffSubmitPage(page);

    await runWithE2ERuntimeSignalMonitoring({
      page,
      testInfo,
      baseURL,
      action: async () => {
        await submitPage.goto(capability.token);
        await submitPage.expectFormVisible();
        await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
        await submitPage.submit();
        await submitPage.expectCompletionVisible();
      },
    });
  });
});
