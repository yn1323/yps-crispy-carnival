import { test } from "../fixtures/e2eTest";
import { convexRunJson } from "../helpers/convex";
import { getNextWeekDates } from "../helpers/date";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { StaffViewPage } from "../pages/StaffViewPage";

const MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

type ConfirmationScenarioSeed = {
  shopId: string;
  recruitmentId: string;
  viewToken: string;
};

type MagicLinkSeed = {
  token: string;
};

test.describe("通知URL起点の確定シフト閲覧", () => {
  test.setTimeout(45_000);

  test("確定URLで閲覧し、使用済みURLから再発行した新URLでも閲覧できる", async ({ browser, page }) => {
    const dates = getNextWeekDates();
    const seed = seedManagerScenario<ConfirmationScenarioSeed>("testing:seedNotificationConfirmationViewScenario", {
      dates,
    });
    const staffView = new StaffViewPage(page);

    await test.step("Step 1: スタッフが確定シフトURLから閲覧できる", async () => {
      await staffView.goto(seed.viewToken);
      await staffView.expectShiftViewVisible();
      await staffView.expectStaffVisible(MANAGER.name);
      await staffView.expectShiftTimeVisible();
    });

    await test.step("Step 2: 別ブラウザでは使用済みURLになり、再発行後の新URLで閲覧できる", async () => {
      // 同じ browser context だと localStorage の staff session が残るため、
      // 使用済みmagic linkの挙動は新規 context で確認する。
      const isolated = await browser.newContext({ baseURL: "http://localhost:3000" });
      const isolatedPage = await isolated.newPage();
      const isolatedView = new StaffViewPage(isolatedPage);

      try {
        await isolatedView.goto(seed.viewToken);
        await isolatedView.expectExpiredVisible();
        await isolatedView.requestReissue(MANAGER.email);

        const reissuedToken = convexRunJson<MagicLinkSeed>("testing:createMagicLinkTokenForLatestRecruitment", {
          recruitmentId: seed.recruitmentId,
          shopId: seed.shopId,
          staffEmail: MANAGER.email,
          purpose: "view",
        });
        await isolatedView.goto(reissuedToken.token);
        await isolatedView.expectShiftViewVisible();
        await isolatedView.expectStaffVisible(MANAGER.name);
        await isolatedView.expectShiftTimeVisible();
      } finally {
        await isolated.close();
      }
    });
  });
});
