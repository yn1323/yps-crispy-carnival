import { expect, test } from "../../fixtures/multiActorTest";
import { seedFreeManagerMultiOrganizationScenario } from "../../helpers/scenarioSeeds";
import { DashboardPage } from "../../pages/DashboardPage";
import { OrganizationSettingsPage } from "../../pages/OrganizationSettingsPage";

test.describe("グループ設定からのグループ削除", { tag: ["@release", "@security"] }, () => {
  test.setTimeout(75_000);

  test("OD-P0-01: 共有アカウントは別グループを継続利用でき、最後のグループ削除後は店舗登録へ戻る", async ({
    actorA,
    multiActorPool,
  }) => {
    const seed = seedFreeManagerMultiOrganizationScenario(multiActorPool, {
      targetOrganizationName: "グループ削除E2E 対象グループ",
      targetShopName: "グループ削除E2E 対象店舗",
      actorBName: "グループ削除E2E 対象スタッフ",
      alternateOrganizationName: "グループ削除E2E 継続グループ",
      alternateShopName: "グループ削除E2E 継続店舗",
    });
    const dashboard = new DashboardPage(actorA.page);
    const settings = new OrganizationSettingsPage(actorA.page);

    await test.step("Step 1: 確認をキャンセルすると対象グループを引き続き利用できる", async () => {
      await settings.goto(seed.targetShopId, "settings");
      await settings.expectOrganization(seed.targetOrganizationName);
      await settings.cancelOrganizationDeletion(seed.targetOrganizationName);
      await dashboard.goto(seed.targetShopId);
      await dashboard.expectSelectedShop(seed.targetShopName, seed.targetShopId);
    });

    await test.step("Step 2: 対象グループを削除すると同じClerkログインの別グループへ移動する", async () => {
      await settings.goto(seed.targetShopId, "settings");
      await settings.deleteOrganization(seed.targetOrganizationName, seed.alternateShopId);
      await dashboard.expectSelectedShop(seed.alternateShopName, seed.alternateShopId);
      await dashboard.expectShopNotSelectable(seed.targetShopName, seed.alternateShopName, seed.alternateShopId);
    });

    await test.step("Step 3: 削除したグループの旧店舗・設定URLから個人情報や業務画面を露出しない", async () => {
      await dashboard.goto(seed.targetShopId);
      await dashboard.expectInvalidShop();
      await expect(actorA.page.getByText(seed.targetOrganizationName, { exact: true })).toHaveCount(0);
      await expect(actorA.page.getByText(seed.targetShopName, { exact: true })).toHaveCount(0);
      await expect(actorA.page.getByText(seed.actorAName, { exact: true })).toHaveCount(0);

      await settings.goto(seed.targetShopId, "settings");
      await dashboard.expectInvalidShop();
      await expect(actorA.page.getByText(seed.targetOrganizationName, { exact: true })).toHaveCount(0);
      await expect(actorA.page.getByText(seed.targetShopName, { exact: true })).toHaveCount(0);
      await expect(actorA.page.getByText(seed.actorAName, { exact: true })).toHaveCount(0);
    });

    await test.step("Step 4: 最後のグループも削除するとClerk認証を保ったまま店舗登録画面になる", async () => {
      await settings.goto(seed.alternateShopId, "settings");
      await settings.deleteOrganization(seed.alternateOrganizationName, null);

      await dashboard.expectSetupRequired();
      await expect(actorA.page.getByText(actorA.email, { exact: true })).toHaveCount(0);
      await expect(actorA.page.getByText(seed.actorAName, { exact: true })).toHaveCount(0);
      await expect(actorA.page.getByText(seed.alternateOrganizationName, { exact: true })).toHaveCount(0);
      await expect(actorA.page.getByText(seed.alternateShopName, { exact: true })).toHaveCount(0);
    });
  });
});
