import { test } from "../fixtures/e2eTest";
import { convexRunJson } from "../helpers/convex";
import { seedOwnerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { StaffLegalConsentPage } from "../pages/StaffLegalConsentPage";
import { StaffSubmitPage } from "../pages/StaffSubmitPage";

type StaffConsentSeed = {
  token: string;
};

type StaffSubmitSeed = {
  token: string;
};

test.describe("法務同意フロー", () => {
  test.setTimeout(45_000);

  test("管理者はダッシュボード上で再同意できる", async ({ page }) => {
    const dashboard = new DashboardPage(page);

    seedOwnerScenario("testing:seedLegalManagerConsentScenario", {
      legalConsentState: "oldRequired",
    });
    await dashboard.goto();
    await dashboard.expectLegalReconsentVisible();
    await dashboard.acceptLegalReconsent();
  });

  test("スタッフはマジックリンクの同意ページで同意できる", async ({ page }) => {
    const seed = convexRunJson<StaffConsentSeed>("testing:seedLegalStaffConsentPageScenario", {
      legalConsentState: "missing",
    });
    const consentPage = new StaffLegalConsentPage(page);

    await consentPage.goto(seed.token);
    await consentPage.expectConsentFormVisible();
    await consentPage.accept();
    await consentPage.expectAcceptedVisible();
  });

  test("未同意スタッフは提出時に同意してシフト希望を提出できる", async ({ page }) => {
    const submitPage = new StaffSubmitPage(page);

    await test.step("未同意ならチェックして提出できる", async () => {
      const seed = convexRunJson<StaffSubmitSeed>("testing:seedLegalStaffSubmitScenario", {
        legalConsentState: "missing",
      });
      await submitPage.goto(seed.token);
      await submitPage.expectFormVisible();
      await submitPage.expectLegalConsentVisible();
      await submitPage.toggleDay("4/7(火)");
      await submitPage.acceptLegalConsent();
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });
  });
});
