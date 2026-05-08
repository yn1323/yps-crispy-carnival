import { test } from "@playwright/test";
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

  test("管理者は同意要求版が古い場合だけダッシュボード上で再同意できる", async ({ page }) => {
    const dashboard = new DashboardPage(page);

    await test.step("文書版だけ古い場合は再同意バナーが出ない", async () => {
      seedOwnerScenario("testing:seedLegalManagerConsentScenario", {
        legalConsentState: "oldDocumentOnly",
      });
      await dashboard.goto();
      await dashboard.expectLegalReconsentNotVisible();
    });

    await test.step("同意要求版が古い場合はバナーから再同意できる", async () => {
      seedOwnerScenario("testing:seedLegalManagerConsentScenario", {
        legalConsentState: "oldRequired",
      });
      await dashboard.goto();
      await dashboard.expectLegalReconsentVisible();
      await dashboard.acceptLegalReconsent();
    });
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

  test("スタッフ希望シフトでは未同意または同意要求版が古い場合だけ提出時に同意する", async ({ page }) => {
    const submitPage = new StaffSubmitPage(page);

    await test.step("同意済みならチェックボックスなしで提出できる", async () => {
      const seed = convexRunJson<StaffSubmitSeed>("testing:seedLegalStaffSubmitScenario", {
        legalConsentState: "current",
      });
      await submitPage.goto(seed.token);
      await submitPage.expectFormVisible();
      await submitPage.expectLegalConsentNotVisible();
      await submitPage.toggleDay("4/7(火)");
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });

    await test.step("文書版だけ古い場合もチェックボックスなしで提出できる", async () => {
      const seed = convexRunJson<StaffSubmitSeed>("testing:seedLegalStaffSubmitScenario", {
        legalConsentState: "oldDocumentOnly",
      });
      await submitPage.goto(seed.token);
      await submitPage.expectFormVisible();
      await submitPage.expectLegalConsentNotVisible();
      await submitPage.toggleDay("4/7(火)");
      await submitPage.submit();
      await submitPage.expectCompletionVisible();
    });

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

    await test.step("同意要求版が古い場合もチェックして提出できる", async () => {
      const seed = convexRunJson<StaffSubmitSeed>("testing:seedLegalStaffSubmitScenario", {
        legalConsentState: "oldRequired",
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
