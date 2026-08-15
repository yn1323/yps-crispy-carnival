import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import {
  resetOrganizationLifecycleScenario,
  seedOrganizationCreationScenario,
  seedOrganizationDeletionScenario,
} from "../helpers/organizationLifecycleScenario";
import { DashboardPage } from "../pages/DashboardPage";
import { OrganizationLifecyclePage } from "../pages/OrganizationLifecyclePage";

// 組織設定には管理者の個人情報が表示されるため、browser artifactへ画面状態を保存しない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("組織ライフサイクル", { tag: ["@e2e-core"] }, () => {
  test.setTimeout(75_000);

  test.afterEach(async () => {
    await resetOrganizationLifecycleScenario();
  });

  test("[E2E-ORGANIZATION-01] 2つ目の組織を作成し、改名後も組織を切り替えて管理できる", async ({ page }) => {
    const seed = seedOrganizationCreationScenario();
    const createdShopName = "E2E 新組織店舗";
    const createdOrganizationName = `${createdShopName}グループ`;
    const renamedOrganizationName = "E2E 改名後グループ";
    const organization = new OrganizationLifecyclePage(page);
    const dashboard = new DashboardPage(page);

    await organization.gotoManagement(seed.organizationId);
    const created = await organization.createOrganization(createdShopName);
    await dashboard.expectSelectedShop(createdShopName, created.organizationId, created.shopId);

    await page.reload({ waitUntil: "commit" });
    await expectAppHydrated(page);
    await dashboard.expectSelectedShop(createdShopName, created.organizationId, created.shopId);

    await organization.gotoOrganization(created.organizationId);
    await organization.expectCurrentOrganization(created.organizationId, createdOrganizationName);
    await organization.renameCurrentOrganization(renamedOrganizationName);
    await page.reload({ waitUntil: "commit" });
    await expectAppHydrated(page);
    await organization.expectCurrentOrganization(created.organizationId, renamedOrganizationName);

    await organization.switchOrganization(seed.organizationName, seed.organizationId);
    await organization.switchOrganization(renamedOrganizationName, created.organizationId);
  });

  test("[E2E-ORGANIZATION-02] 組織を削除し、残した組織の店舗で管理を継続する", async ({ page }) => {
    const seed = seedOrganizationDeletionScenario();
    const organization = new OrganizationLifecyclePage(page);
    const dashboard = new DashboardPage(page);

    await organization.gotoOrganization(seed.targetOrganizationId);
    await organization.expectCurrentOrganization(seed.targetOrganizationId, seed.targetOrganizationName);
    await organization.deleteCurrentOrganization();

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/dashboard" &&
        url.searchParams.get("org") === seed.alternateOrganizationId &&
        url.searchParams.get("shop") === seed.alternateShopId,
      { timeout: 20_000 },
    );
    await expectAppHydrated(page);
    await dashboard.expectSelectedShop(seed.alternateShopName, seed.alternateOrganizationId, seed.alternateShopId);

    await page.reload({ waitUntil: "commit" });
    await expectAppHydrated(page);
    await dashboard.expectSelectedShop(seed.alternateShopName, seed.alternateOrganizationId, seed.alternateShopId);

    await organization.gotoOrganization(seed.alternateOrganizationId);
    await organization.expectOnlyOrganization(
      seed.alternateOrganizationId,
      seed.alternateOrganizationName,
      seed.targetOrganizationName,
    );
  });
});
