import { expect, test } from "@playwright/test";
import { convexRun } from "../helpers/convex";
import { getOrCreateLineLinkToken } from "../helpers/notificationTokens";
import { DashboardPage } from "../pages/DashboardPage";

const MANAGER = {
  name: "田中太郎",
  email: "tanaka@example.com",
};

test.describe("LINE連携URL発行", () => {
  test.setTimeout(60_000);

  test.beforeEach(async () => {
    convexRun("testing:clearAllTables");
  });

  test("店長操作でLINE連携トークンが発行される", async ({ page }) => {
    const dashboard = new DashboardPage(page);

    await test.step("Step 1: 店長が初期セットアップを行う", async () => {
      await dashboard.goto();
      await dashboard.completeSetup({
        shopName: "テスト居酒屋",
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
        ownerName: MANAGER.name,
        ownerEmail: MANAGER.email,
      });
      await dashboard.expectSetupComplete();
    });

    await test.step("Step 2: LINE連携QR/URLを発行する", async () => {
      await dashboard.openLineQr(MANAGER.name);
      const lineToken = await getOrCreateLineLinkToken(MANAGER.email);
      expect(lineToken.token).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});
