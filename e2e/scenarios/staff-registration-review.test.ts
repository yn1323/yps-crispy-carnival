import { test } from "../fixtures/e2eTest";
import { seedManagerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { StaffRegistrationPage } from "../pages/StaffRegistrationPage";

type StaffRegistrationReviewSeed = {
  shopId: string;
  registrationToken: string;
};

const APPROVED_STAFF = {
  name: "承認スタッフ",
  email: "approved-registration-e2e@example.com",
};

const REJECTED_STAFF = {
  name: "却下スタッフ",
  email: "rejected-registration-e2e@example.com",
};

test.describe("スタッフ参加申請の承認/却下", () => {
  test.setTimeout(45_000);

  test("スタッフ登録→承認", async ({ page }) => {
    const seed = seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ参加承認E2E店舗",
    });
    const registrationPage = new StaffRegistrationPage(page);
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: スタッフが登録ページから参加申請する", async () => {
      await registrationPage.goto(seed.registrationToken);
      await registrationPage.submitRequest(APPROVED_STAFF);
    });

    await test.step("Step 2: シフト担当者がDashboardで申請を承認する", async () => {
      await dashboard.goto();
      await dashboard.expectStaffRegistrationRequestBanner(1);
      await dashboard.openStaffRegistrationRequests();
      await dashboard.approveStaffRegistrationRequest(APPROVED_STAFF.name);
      await dashboard.expectStaffRegistrationRequestBannerHidden();
      await dashboard.expectStaffVisible(APPROVED_STAFF.name);
    });
  });

  test("スタッフ登録→却下", async ({ page }) => {
    const seed = seedManagerScenario<StaffRegistrationReviewSeed>("testing:seedStaffRegistrationReviewScenario", {
      shopName: "スタッフ参加却下E2E店舗",
    });
    const registrationPage = new StaffRegistrationPage(page);
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: スタッフが登録ページから参加申請する", async () => {
      await registrationPage.goto(seed.registrationToken);
      await registrationPage.submitRequest(REJECTED_STAFF);
    });

    await test.step("Step 2: シフト担当者がDashboardで申請を却下する", async () => {
      await dashboard.goto();
      await dashboard.expectStaffRegistrationRequestBanner(1);
      await dashboard.openStaffRegistrationRequests();
      await dashboard.rejectStaffRegistrationRequest(REJECTED_STAFF.name);
      await dashboard.expectStaffRegistrationRequestBannerHidden();
      await dashboard.expectStaffNotVisible(REJECTED_STAFF.name);
    });
  });
});
