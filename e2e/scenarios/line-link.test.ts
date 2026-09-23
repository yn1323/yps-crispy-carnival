import { expect, test } from "../fixtures/e2eTest";
import { expectAppHydrated } from "../helpers/appReadiness";
import { convexRunJson } from "../helpers/convex";
import { assertNotificationDeliverySuppressed } from "../helpers/notificationProbe";
import { getE2EManagerAuthTokenIdentifier, seedManagerScenario } from "../helpers/scenarioSeeds";
import { UserLinePage } from "../pages/UserLinePage";

type LineLinkSeed = {
  organizationId: string;
  personId: string;
  shopId: string;
};

// LINE連携capabilityを表示するため、artifactを作らない。
test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("組織共通のLINE連携", { tag: ["@e2e-core", "@capability"] }, () => {
  // 連携URL発行、provider代替seed、再読込、解除確認を含む。3-worker実測へcleanup余裕を加えた失敗上限。
  test.setTimeout(60_000);

  test("[E2E-LINE-01] 画面で発行した連携リンクで連携が完了し、解除すると未連携へ戻る", async ({ page }) => {
    const seed = seedManagerScenario<LineLinkSeed>("testing:seedLineLinkScenario");
    assertNotificationDeliverySuppressed(seed.shopId);
    const line = new UserLinePage(page);

    await test.step("管理者がスタッフ詳細で連携リンクを表示する", async () => {
      await line.goto(seed.organizationId, seed.personId);
      await line.expectLineStatus("LINE未連携");
      await line.showLinkQr();
    });

    await test.step("LINE Loginとcode交換だけを代替し、発行済みtokenで連携を確定する", async () => {
      const result = convexRunJson<{ status: string }>("testing:completeLineLinkForE2E", {
        managerAuthTokenIdentifier: getE2EManagerAuthTokenIdentifier(),
        organizationPersonId: seed.personId,
      });
      expect(result.status).toBe("ok");
    });

    await test.step("再読込後に連携済みと表示され、解除すると未連携へ戻る", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectAppHydrated(page);
      await line.expectLineStatus("LINE連携済み");
      await line.disconnect();
      await line.expectLineStatus("LINE未連携");
    });
  });
});
