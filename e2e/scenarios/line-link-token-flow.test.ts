import { expect, test } from "@playwright/test";
import { getOrCreateLineLinkToken } from "../helpers/notificationTokens";
import { seedOwnerScenario } from "../helpers/scenarioSeeds";
import { DashboardPage } from "../pages/DashboardPage";

const MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

test.describe("LINE連携URL発行", () => {
  test.setTimeout(30_000);

  test("店長操作でLINE連携トークンが発行される", async ({ page }) => {
    seedOwnerScenario("testing:seedLineLinkScenario");
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: LINE連携QR/URLを発行する", async () => {
      await dashboard.goto();
      await dashboard.openLineQr(MANAGER.name);
      const lineToken = await getOrCreateLineLinkToken(MANAGER.email);
      expect(lineToken.token).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});
