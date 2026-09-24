import { expect, test } from "../fixtures/e2eTest";
import { withAnonymousStaffPage } from "../helpers/anonymousStaffPage";
import { expectAppHydrated } from "../helpers/appReadiness";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { AppShiftsPage } from "../pages/AppShiftsPage";
import { DashboardPage } from "../pages/DashboardPage";
import { StaffLifecyclePage } from "../pages/StaffLifecyclePage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

type OnboardingSeed = {
  organizationId: string;
  shopId: string;
};

const GUIDE_TITLES = {
  createRecruitment: "シフト募集→提出→確定の流れを体験してみましょう",
  submitSelf: "希望シフトを提出してみましょう",
  reviewSubmission: "提出されたシフトを確認しましょう",
  addStaff: "スタッフを追加して、希望シフトを集めましょう",
} as const;

// 提出capabilityとスタッフの氏名・メールアドレスを扱うため、artifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("ログイン後の体験ガイド", { tag: ["@e2e-core", "@capability"] }, () => {
  // Dashboard、募集作成、匿名提出、シフト表、スタッフ追加の4ステップを含む。3-worker実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(120_000);

  test("[E2E-ONBOARDING-01] 体験ガイドの4ステップを実際の操作で進め、閉じると再表示されない", async ({
    baseURL,
    browser,
    e2eClerkUser,
    page,
  }, testInfo) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<OnboardingSeed>("testing:seedNotificationSubmitScenario", { dates });
    assertNotificationDeliverySuppressed(seed.shopId);
    const dashboard = new DashboardPage(page);
    const shifts = new AppShiftsPage(page);
    const staff = new StaffLifecyclePage(page);
    const dashboardScope = { organizationId: seed.organizationId, shopId: seed.shopId };
    const addedStaffName = `E2Eガイド追加スタッフ${testInfo.parallelIndex}`;
    const expectGuide = async (title: string) => {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    };

    await test.step("1/4：Dashboardから募集を作る", async () => {
      await dashboard.goto(dashboardScope);
      await expectGuide(GUIDE_TITLES.createRecruitment);
      await shifts.createRecruitmentForCurrentShop(dates);
      await expectGuide(GUIDE_TITLES.submitSelf);
    });

    const submitCapability = await waitForMagicLinkToken({
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "submit",
    });

    await test.step("2/4：自分宛ての提出リンクから希望シフトを提出する", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-onboarding-submit",
        action: async (anonymousPage) => {
          const submitPage = new StaffSubmitPage(anonymousPage);
          await submitPage.goto(submitCapability.token);
          await submitPage.expectFormVisible();
          await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
          await submitPage.submit();
          await submitPage.expectCompletionVisible();
        },
      });
      await expectGuide(GUIDE_TITLES.reviewSubmission);
    });

    await test.step("3/4：Dashboardの最新募集からシフト表を開く", async () => {
      await shifts.openRecruitmentCardByPeriod(dates);
      await page.goBack();
      await expectAppHydrated(page);
      await expectGuide(GUIDE_TITLES.addStaff);
    });

    await test.step("4/4：Dashboardからスタッフを追加し、ガイドを閉じる", async () => {
      await page.getByRole("button", { name: "スタッフを追加する", exact: true }).click();
      await staff.registerManualStaffInOpenDialog(
        addedStaffName,
        `e2e-onboarding-${testInfo.parallelIndex}-${Date.now()}@example.test`,
      );
      await dashboard.expectStaffVisible(addedStaffName);
      await page.getByRole("button", { name: "シフトリへようこそを閉じる", exact: true }).click();
      await expect(page.getByText(GUIDE_TITLES.addStaff, { exact: true })).toHaveCount(0);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expectAppHydrated(page);
      await dashboard.expectStaffVisible(addedStaffName);
      await expect(page.getByText(GUIDE_TITLES.addStaff, { exact: true })).toHaveCount(0);
    });
  });
});
