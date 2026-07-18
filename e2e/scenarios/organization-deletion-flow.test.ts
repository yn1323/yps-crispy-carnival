import { expect, test } from "../fixtures/e2eTest";
import { expectNoA11yViolations } from "../helpers/accessibility";
import { resetCurrentManagerScenarioData, seedOrganizationDeletionScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";
import { OrganizationSettingsPage } from "../pages/OrganizationSettingsPage";

test.describe("最後のグループとアカウントの削除", { tag: ["@release", "@security", "@a11y"] }, () => {
  test.setTimeout(75_000);

  test.afterEach(() => {
    resetCurrentManagerScenarioData();
  });

  test("OD-P0-02: 名前確認を経て最後のグループを削除し、再読込後も個人情報を表示しない", async ({
    page,
    e2eClerkUser,
  }, testInfo) => {
    const seed = seedOrganizationDeletionScenario({
      targetOrganizationName: "アカウント削除E2E 対象グループ",
      targetShopName: "アカウント削除E2E 対象店舗",
      actorBName: "アカウント削除E2E 対象スタッフ",
      alternateOrganizationName: "アカウント削除E2E 前処理グループ",
      alternateShopName: "アカウント削除E2E 前処理店舗",
    });
    const dashboard = new DashboardPage(page);
    const settings = new OrganizationSettingsPage(page);

    await test.step("Step 1: もう一方のグループを削除し、対象グループだけに所属する状態を作る", async () => {
      await settings.goto(seed.alternateShopId, "settings");
      await settings.deleteOrganization(seed.alternateOrganizationName, seed.targetShopId);
      await dashboard.expectSelectedShop(seed.targetShopName, seed.targetShopId);
    });

    await test.step("Step 2: 削除確認をキャンセルすると対象グループを利用し続けられる", async () => {
      await settings.goto(seed.targetShopId, "settings");
      await settings.openOrganizationDeletionConfirmation();
      await expectNoA11yViolations(page, testInfo);
      await settings.cancelOpenOrganizationDeletion(seed.targetOrganizationName);
      await dashboard.goto(seed.targetShopId);
      await dashboard.expectSelectedShop(seed.targetShopName, seed.targetShopId);
    });

    await test.step("Step 3: グループ名が完全一致しない間は削除を確定できない", async () => {
      await settings.goto(seed.targetShopId, "settings");
      await settings.rejectMismatchedOrganizationDeletionName(
        seed.targetOrganizationName,
        `${seed.targetOrganizationName} `,
      );
    });

    await test.step("Step 4: 最後のグループを削除するとClerk認証を保った削除済み画面になる", async () => {
      await settings.deleteOrganization(seed.targetOrganizationName, null);
      await expect(page.getByRole("heading", { name: "アプリ上のアカウントは削除済みです" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
      await expect(page.getByText(e2eClerkUser, { exact: true })).toHaveCount(0);
      await expect(page.getByText(seed.targetOrganizationName, { exact: true })).toHaveCount(0);
      await expect(page.getByText(seed.targetShopName, { exact: true })).toHaveCount(0);
    });

    await test.step("Step 5: 再読込しても通常画面へ戻らず、削除前の個人情報を再表示しない", async () => {
      await page.reload();
      await expect(page.getByRole("heading", { name: "アプリ上のアカウントは削除済みです" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText(e2eClerkUser, { exact: true })).toHaveCount(0);
      await expect(page.getByText(seed.targetOrganizationName, { exact: true })).toHaveCount(0);
      await expect(page.getByText(seed.targetShopName, { exact: true })).toHaveCount(0);
    });
  });
});
