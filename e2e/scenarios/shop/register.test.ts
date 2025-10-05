import { expect, test } from "@playwright/test";

test.describe("店舗登録", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/shops/new");
  });

  test("店舗を正常に登録できること", async ({ page }) => {
    const shopName = `E2Eテスト店舗_${new Date().toISOString()}`;

    // 店舗名入力
    await page.getByLabel("店舗名").fill(shopName);

    // 店舗メモ入力（任意）
    await page.getByLabel("店舗メモ（マネージャー向け）").fill("E2Eテスト用の店舗です");

    // 登録ボタンをクリック
    await page.getByRole("button", { name: "登録" }).click();

    // トースト確認
    await expect(page.getByText("店舗登録が完了しました")).toBeVisible();

    // /shops に遷移したことを確認
    await expect(page).toHaveURL("/shops");

    // 登録した店舗が一覧に表示されることを確認
    await expect(page.getByText(shopName)).toBeVisible();
  });
});
