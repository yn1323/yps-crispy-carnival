// 店舗削除の入口UIを再検討するため、ヘッダーメニュー入口とこのE2Eは一時停止中です。
// import { test } from "../fixtures/e2eTest";
// import { resetCurrentManagerScenarioData } from "../helpers/scenarioSeeds";
// import { DashboardPage } from "../pages/DashboardPage";
//
// test.describe("店舗削除", () => {
//   test.setTimeout(60_000);
//
//   let dashboard: DashboardPage;
//
//   test.beforeEach(async ({ page }) => {
//     dashboard = new DashboardPage(page);
//   });
//
//   test("右上メニューから店舗削除を確認して、所属店舗0件では店舗登録導線に戻る", async () => {
//     const shopName = "店舗削除テスト店舗";
//     resetCurrentManagerScenarioData();
//
//     await test.step("Step 1: 店舗を登録する", async () => {
//       await dashboard.goto();
//       await dashboard.completeSetup({
//         shopName,
//         managerName: "店舗削除管理者",
//         managerEmail: "shop-delete-manager@example.com",
//       });
//       await dashboard.expectSetupComplete();
//       await dashboard.expectShopName(shopName);
//     });
//
//     await test.step("Step 2: 削除確認をキャンセルすると店舗は残る", async () => {
//       await dashboard.cancelShopDeletion(shopName);
//       await dashboard.expectShopName(shopName);
//     });
//
//     await test.step("Step 3: 削除を確定すると店舗登録導線に戻る", async () => {
//       await dashboard.deleteCurrentShop(shopName);
//       await dashboard.expectShopDeletionUnavailable();
//     });
//   });
// });
