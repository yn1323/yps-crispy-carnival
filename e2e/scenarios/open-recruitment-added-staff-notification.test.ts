import { expect, test } from "../fixtures/e2eTest";
import { convexRunJson } from "../helpers/convex";
import { formatDateWithWeekday, getNextWeekDates } from "../helpers/date";
import { waitForMagicLinkToken } from "../helpers/notificationTokens";
import { seedOwnerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

const ADDED_STAFF = {
  name: "追加スタッフ",
  email: "added-staff@example.com",
};

const MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

type OpenRecruitmentSeed = {
  shopId: string;
  recruitmentId: string;
};

test.describe("募集中の追加スタッフ通知", () => {
  test.setTimeout(45_000);

  test("募集中にスタッフを追加すると、そのスタッフの希望提出リンクが発行される", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedOwnerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", { dates });
    const dashboard = new DashboardPage(page);
    const submitPage = new StaffSubmitPage(page);

    await test.step("Step 1: 募集中の店舗にスタッフを追加する", async () => {
      await dashboard.goto();
      await dashboard.addStaffs([ADDED_STAFF]);
      await dashboard.expectStaffVisible(ADDED_STAFF.name);
    });

    await test.step("Step 2: 追加スタッフ向けの希望提出リンクから提出できる", async () => {
      const token = await waitForMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: ADDED_STAFF.email,
        purpose: "submit",
      });
      await submitPage.goto(token.token);
      await submitPage.expectFormVisible();
      await submitPage.expectUnsubmittedBadge();
      await submitPage.toggleDay(formatDateWithWeekday(dates.dates[0]));
      await submitPage.acceptLegalConsent();
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });
  });

  test("LINE follow時に募集中シフトの希望提出リンクが発行される", async ({ page }) => {
    const dates = getNextWeekDates();
    const seed = seedOwnerScenario<OpenRecruitmentSeed>("testing:seedOpenRecruitmentNotificationScenario", { dates });
    const submitPage = new StaffSubmitPage(page);

    await test.step("Step 1: LINE follow相当の状態更新を行う", async () => {
      const result = convexRunJson<{ scheduled: boolean }>("testing:simulateLineFollowForStaff", {
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
      });
      expect(result.scheduled).toBe(true);
    });

    await test.step("Step 2: LINE通知で発行された希望提出リンクから提出できる", async () => {
      const token = await waitForMagicLinkToken({
        recruitmentId: seed.recruitmentId,
        shopId: seed.shopId,
        staffEmail: MANAGER.email,
        purpose: "submit",
      });
      await submitPage.goto(token.token);
      await submitPage.expectFormVisible();
      await submitPage.expectUnsubmittedBadge();
    });
  });
});
