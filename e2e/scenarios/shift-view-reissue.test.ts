import { expect, test } from "../fixtures/e2eTest";
import { withAnonymousStaffPage } from "../helpers/anonymousStaffPage";
import { expectAppHydrated } from "../helpers/appReadiness";
import { getNextWeekDates } from "../helpers/date";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { StaffViewPage } from "../pages/StaffViewPage";

type ConfirmedShiftSeed = {
  organizationId: string;
  shopId: string;
  recruitmentId: string;
};

const STAFF_NAME = "田中太郎";

// bearer capabilityとメールアドレスを扱うため、artifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("確定シフト閲覧リンクの再発行", { tag: ["@e2e-core", "@capability"] }, () => {
  // 匿名の再発行画面、capability発行待ち、別contextの閲覧を含む。3-worker実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(60_000);

  test("[E2E-REISSUE-01] スタッフが閲覧リンクを再発行し、新しいリンクで確定シフトを開ける", async ({
    baseURL,
    browser,
    e2eClerkUser,
  }, testInfo) => {
    const seed = seedManagerScenario<ConfirmedShiftSeed>("testing:seedConfirmedShiftScenario", {
      dates: getNextWeekDates(),
    });
    assertNotificationDeliverySuppressed(seed.shopId);

    await test.step("匿名スタッフが再発行画面でメールアドレスを入力して申し込む", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-view-reissue",
        action: async (anonymousPage) => {
          await anonymousPage.goto(`/shifts/reissue?recruitmentId=${seed.recruitmentId}`, {
            waitUntil: "domcontentloaded",
          });
          await expectAppHydrated(anonymousPage);
          await anonymousPage.getByLabel("メールアドレス").fill(e2eClerkUser);
          await anonymousPage.getByRole("button", { name: "再発行を申し込む", exact: true }).click();
          await expect(anonymousPage.getByText("再発行を受け付けました", { exact: true })).toBeVisible();
        },
      });
    });

    const viewCapability = await waitForMagicLinkToken({
      recruitmentId: seed.recruitmentId,
      shopId: seed.shopId,
      staffEmail: e2eClerkUser,
      purpose: "view",
    });

    await test.step("別の匿名contextで、再発行されたリンクから確定シフトを閲覧する", async () => {
      await withAnonymousStaffPage({
        browser,
        baseURL,
        testInfo,
        attachmentName: "e2e-safe-browser-signals-reissued-view",
        action: async (anonymousPage) => {
          const viewPage = new StaffViewPage(anonymousPage);
          await viewPage.goto(viewCapability.token);
          await viewPage.expectShiftViewVisible();
          await viewPage.expectStaffVisible(STAFF_NAME);
          await viewPage.expectShiftTimeVisible();
        },
      });
    });
  });
});
