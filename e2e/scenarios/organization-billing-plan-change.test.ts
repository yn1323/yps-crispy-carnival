import { test } from "../fixtures/e2eTest";
import { resetCurrentManagerScenarioData, seedOrganizationBillingPlanChangeScenario } from "../helpers/scenarioSeeds";
import { OrganizationSettingsPage } from "../pages/OrganizationSettingsPage";

test.describe("グループ課金プランの表示と上限復旧", { tag: ["@release"] }, () => {
  test.setTimeout(60_000);

  test.afterEach(() => {
    resetCurrentManagerScenarioData();
  });

  test("BILL-P0-02: 支払い不要Businessを保ち、BusinessからProへの変更後の超過を人物削除で復旧する", async ({
    page,
  }) => {
    const seed = seedOrganizationBillingPlanChangeScenario({
      complimentaryOrganizationName: "支払い不要Business E2Eグループ",
      complimentaryShopName: "支払い不要Business E2E店舗",
      restrictedOrganizationName: "BusinessからPro復旧 E2Eグループ",
      restrictedShopName: "BusinessからPro復旧 E2E店舗",
      removablePersonName: "Pro上限復旧で削除するユーザー",
    });
    const settings = new OrganizationSettingsPage(page);

    await test.step("Step 1: 支払い不要Businessは40/5/5の枠だけを表示し、課金操作を出さない", async () => {
      await settings.goto(seed.complimentaryShopId, "billing");
      await settings.expectOrganization(seed.complimentaryOrganizationName);
      await settings.expectComplimentaryBusiness();
    });

    await test.step("Step 2: BusinessからProへの変更後はPro上限と必要削減人数を表示する", async () => {
      await settings.switchOrganization(seed.restrictedOrganizationName, seed.restrictedShopId);
      await settings.expectOrganization(seed.restrictedOrganizationName);
      await settings.expectBillingPlan("Business");
      await settings.expectBillingUsage("利用人数", seed.expectedRestrictedPeople, seed.expectedProLimit);
      await settings.expectBillingUsage("店舗数", 1, 5);
      await settings.expectBillingUsage("管理者数", 1, 5);
      await settings.expectProLimitApplied();
      await settings.expectPlanReductionRequired(seed.expectedRestrictedPeople - seed.expectedProLimit);
    });

    await test.step("Step 3: 余剰人物を削除すると、データを選び直さずProへ復旧する", async () => {
      await settings.removePerson(seed.removablePersonName);
      await settings.expectOrganization(seed.restrictedOrganizationName);
      await settings.expectBillingPlan("Pro");
      await settings.expectBillingUsage("利用人数", seed.expectedProLimit, seed.expectedProLimit);
      await settings.expectPlanReductionResolved();
      await settings.expectPlanChangeAvailable("Business");
    });
  });
});
